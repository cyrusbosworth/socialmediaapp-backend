const { db } = require('../util/admin');

exports.getAllPosts = async (req, res) => {
	const data = await db
		.collection('posts')
		.orderBy('createdAt', 'desc')
		.get()
		.catch(err => console.error(error));

	let posts = [];
	data.forEach(doc => {
		let postData = doc.data();
		posts.push(postData);
	});
	return res.json(posts);
};

exports.postOnePost = async (req, res) => {
	if (req.body.body.trim() === '') {
		return res.status(400).json({ body: 'Body must not be empty' });
	}

	if (req.body.title.trim() === '') {
		return res.status(400).json({ title: 'Title must not be empty' });
	}

	const newPost = {
		body: req.body.body,
		title: req.body.title,
		userImage: req.user.imageUrl,
		userHandle: req.user.handle,
		createdAt: new Date().toISOString(),
		followCount: 0,
		commentCount: 0,
		comments: [],
		postId: ''
	};
	try {
		doc = await db.collection('posts').add(newPost);

		await doc.update({ postId: doc.id });
		const resPost = newPost;
		resPost.postId = doc.id;

		res.json(resPost);
	} catch (err) {
		res.status(500).json({ error: 'something went wrong' });
		console.error(err);
	}
};

//TODO this still gets the comments separately, unneeded
exports.getPost = (req, res) => {
	let postData = {};
	db.doc(`/posts/${req.params.postId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Post not found' });
			}
			postData = doc.data();
			return db
				.collection('comments')
				.orderBy('createdAt', 'desc')
				.where('postId', '==', req.params.postId)
				.get();
		})
		.then(data => {
			postData.comments = [];
			data.forEach(doc => {
				postData.comments.push(doc.data());
			});
			return res.json(postData);
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.commentOnPost = (req, res) => {
	if (req.body.body.trim() === '') {
		return res.status(400).json({ comment: 'Must not be empty' });
	}
	const newComment = {
		body: req.body.body,
		createdAt: new Date().toISOString(),
		postId: req.params.postId,
		userHandle: req.user.handle,
		userImage: req.user.imageUrl
	};

	db.doc(`/posts/${req.params.postId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Post not found' });
			}
			const postData = doc.data();
			console.log('postData', postData);
			const comments = postData.comments;
			comments.push(newComment);
			return doc.ref.update({ commentCount: doc.data().commentCount + 1, comments: comments });
		})
		.then(() => {
			return db.collection('comments').add(newComment);
		})
		.then(() => {
			res.json(newComment);
		})
		.catch(err => {
			res.status(500).json({ error: 'Something went wrong' });
			console.error(err);
		});
};

exports.followPost = (req, res) => {
	const followDoc = db
		.collection('follows')
		.where('userHandle', '==', req.user.handle)
		.where('postId', '==', req.params.postId)
		.limit(1);

	const postDoc = db.doc(`/posts/${req.params.postId}`);

	let postData;

	postDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				postData = doc.data();
				postData.postId = doc.id;
				return followDoc.get();
			} else {
				return res.status(404).json({ error: 'Post not found' });
			}
		})
		.then(data => {
			if (data.empty) {
				return db
					.collection('follows')
					.add({
						postId: req.params.postId,
						userHandle: req.user.handle
					})
					.then(() => {
						postData.followCount++;
						return postDoc.update({ followCount: postData.followCount });
					})
					.then(() => {
						return res.json(postData);
					});
			} else {
				return res.status(400).json({ error: 'Post already followed' });
			}
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.unfollowPost = (req, res) => {
	const followDoc = db
		.collection('follows')
		.where('userHandle', '==', req.user.handle)
		.where('postId', '==', req.params.postId)
		.limit(1);

	const postDoc = db.doc(`/posts/${req.params.postId}`);

	let postData;

	postDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				postData = doc.data();
				postData.postId = doc.id;
				return followDoc.get();
			} else {
				return res.status(404).json({ error: 'Post not found' });
			}
		})
		.then(data => {
			if (data.empty) {
				return res.status(400).json({ error: 'Post never followed' });
			} else {
				return db
					.doc(`/follows/${data.docs[0].id}`)
					.delete()
					.then(() => {
						postData.followCount--;
						return postDoc.update({ followCount: postData.followCount });
					})
					.then(() => {
						res.json(postData);
					});
			}
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.deletePost = (req, res) => {
	const document = db.doc(`/posts/${req.params.postId}`);
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Post not found' });
			}
			if (doc.data().userHandle !== req.user.handle) {
				return res.status(403).json({ error: 'Unauthorized' });
			} else {
				return document.delete();
			}
		})
		.then(() => {
			res.json({ message: 'Post deleted successfully' });
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};
