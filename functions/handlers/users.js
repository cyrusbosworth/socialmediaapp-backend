const { admin, db } = require('../util/admin');
const config = require('../util/config');
const firebase = require('firebase');
firebase.initializeApp(config);

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators');

exports.signup = (req, res) => {
	const newUser = {
		email: req.body.email,
		password: req.body.password,
		confirmPassword: req.body.confirmPassword,
		handle: req.body.handle
	};

	const { valid, errors } = validateSignupData(newUser);

	if (!valid) return res.status(400).json(errors);

	const noImg = 'no-img.png';

	let token, userId;
	db.doc(`/users/${newUser.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				return res.status(400).json({ handle: 'This handle is already taken' });
			} else {
				return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password);
			}
		})
		.then(data => {
			userId = data.user.uid;
			return data.user.getIdToken();
		})
		.then(idToken => {
			token = idToken;
			const userCredentials = {
				handle: newUser.handle,
				email: newUser.email,
				createdAt: new Date().toISOString(),
				imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
				userId: userId
			};
			return db.doc(`/users/${newUser.handle}`).set(userCredentials);
		})
		.then(() => {
			return res.status(201).json({ token });
		})
		.catch(err => {
			console.error(err);
			if (err.code === 'auth/email-already-in-use') {
				return res.status(400).json({ email: 'Email is already in use' });
			} else if (err.code === 'auth/weak-password') {
				return res.status(400).json({ password: 'Password must be at least 6 characters' });
			} else {
				console.log(err);
				return res.status(500).json({ general: 'Something went wrong, please try again' });
			}
		});
};

exports.login = (req, res) => {
	const user = {
		email: req.body.email,
		password: req.body.password
	};

	const { valid, errors } = validateLoginData(user);

	if (!valid) return res.status(400).json(errors);

	firebase
		.auth()
		.signInWithEmailAndPassword(user.email, user.password)
		.then(data => {
			return data.user.getIdToken();
		})
		.then(token => {
			return res.json({ token });
		})
		.catch(err => {
			console.error(err);
			return res.status(403).json({ general: 'Wrong credentials, please try again' });
		});
};

//Add user details
exports.addUserDetails = async (req, res) => {
	let userDetails = reduceUserDetails(req.body);

	try {
		await db.doc(`/users/${req.user.handle}`).update(userDetails);
		return res.status(200).json({ message: 'User details updated' });
	} catch (err) {
		console.error(err);
		return res.status(500).json({ error: err.code });
	}
};

//get own user details
exports.getAuthenticatedUser = (req, res) => {
	let userData = {};

	db.doc(`/users/${req.user.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data();

				return db
					.collection('follows')
					.where('userHandle', '==', req.user.handle)
					.get();
			}
		})
		.then(data => {
			userData.follows = [];
			data.forEach(doc => {
				userData.follows.push(doc.data());
			});

			return db
				.collection('notifications')
				.where('recipient', '==', req.user.handle)
				.orderBy('createdAt', 'desc')
				.limit(10)
				.get();
		})
		.then(data => {
			userData.notifications = [];
			//NB fix this follow the other one
			data.forEach(doc => {
				userData.notifications.push({
					recipient: doc.data().recipient,
					sender: doc.data().sender,
					createdAt: doc.data().createdAt,
					postId: doc.data().postId,
					type: doc.data().type,
					read: doc.data().read,
					notificationId: doc.id
				});
			});

			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};

//Get any user details
exports.getUserDetails = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.params.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.user = doc.data();
				return db
					.collection('posts')
					.where('userHandle', '==', req.params.handle)
					.orderBy('createdAt', 'desc')
					.get();
			} else {
				return res.status(404).json({ error: 'User not found' });
			}
		})
		.then(data => {
			userData.posts = [];

			data.forEach(doc => {
				let postData = doc.data();
				postData.postId = doc.id;
				userData.posts.push(postData);
			});
			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};

//upload user profile image
exports.uploadImage = (req, res) => {
	const BusBoy = require('busboy');
	const path = require('path');
	const os = require('os');
	const fs = require('fs');

	const busboy = new BusBoy({ headers: req.headers });

	let imageFileName;
	let imageToBeUploaded = {};

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
			return res.status(400).json({ error: 'Wrong file type submitted' });
		}
		console.log(fieldname);
		console.log(filename);
		console.log(mimetype);

		//TODO fix random filename generation
		const imageExtension = filename.split('.').pop();
		imageFileName = `${Math.floor(Math.random() * 10000000000000000)}.${imageExtension}`;
		const filepath = path.join(os.tmpdir(), imageFileName);
		imageToBeUploaded = { filepath, mimetype };
		file.pipe(fs.createWriteStream(filepath));
	});
	busboy.on('finish', () => {
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filepath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
				return db.doc(`/users/${req.user.handle}`).update({ imageUrl: imageUrl });
			})
			.then(() => {
				return res.json({ message: 'Image uploaded successfully' });
			})
			.catch(err => {
				console.error(err);
				return res.status(500).json({ error: err.code });
			});
	});
	busboy.end(req.rawBody);
};

//This might not work testing is at the end of #12
exports.markNotificationsRead = (req, res) => {
	let batch = db.batch();
	req.body.forEach(notificationId => {
		const notification = db.doc(`/notifications/${notificationId}`);
		batch.update(notification, { read: true });
	});

	batch
		.commit()
		.then(() => {
			return res.json({ message: 'Notification marked read' });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
