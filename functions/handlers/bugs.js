const { db } = require('../util/admin');

exports.getAllBugs = async (req, res) => {
	const data = await db
		.collection('bugs')
		.orderBy('createdAt', 'desc')
		.get()
		.catch(err => console.error(error));

	let bugs = [];
	data.forEach(doc => {
		let bugData = doc.data();
		bugData.bugId = doc.id;
		bugs.push(bugData);
	});
	return res.json(bugs);
};

// exports.getAllBugs = (req, res) => {
// 	db.collection('bugs')
// 		.orderBy('createdAt', 'desc')
// 		.get()
// 		.then(data => {
// 			let bugs = [];
// 			data.forEach(doc => {
// 				let bugData = doc.data();
// 				bugData.bugId = doc.id;
// 				bugs.push(bugData);
// 			});
// 			return res.json(bugs);
// 		})
// 		.catch(err => console.error(error));
// };

exports.postOneBug = (req, res) => {
	if (req.body.body.trim() === '') {
		return res.status(400).json({ body: 'Body must not be empty' });
	}
	const newBug = {
		body: req.body.body,
		userImage: req.user.imageUrl,
		userHandle: req.user.handle,
		createdAt: new Date().toISOString(),
		likeCount: 0,
		commentCount: 0
	};

	db.collection('bugs')
		.add(newBug)
		.then(doc => {
			const resBug = newBug;
			resBug.bugId = doc.id;
			res.json(resBug);
		})
		.catch(err => {
			res.status(500).json({ error: 'something went wrong' });
			console.error(err);
		});
};

exports.getBug = (req, res) => {
	let bugData = {};
	db.doc(`/bugs/${req.params.bugId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Bug not found' });
			}
			bugData = doc.data();
			bugData.bugId = doc.id;
			return db
				.collection('comments')
				.orderBy('createdAt', 'desc')
				.where('bugId', '==', req.params.bugId)
				.get();
		})
		.then(data => {
			bugData.comments = [];
			data.forEach(doc => {
				bugData.comments.push(doc.data());
			});
			return res.json(bugData);
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.commentOnBug = (req, res) => {
	if (req.body.body.trim() === '') {
		return res.status(400).json({ comment: 'Must not be empty' });
	}
	const newComment = {
		body: req.body.body,
		createdAt: new Date().toISOString(),
		bugId: req.params.bugId,
		userHandle: req.user.handle,
		userImage: req.user.imageUrl
	};

	db.doc(`/bugs/${req.params.bugId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Bug not found' });
			}
			return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
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

exports.likeBug = (req, res) => {
	const likeDoc = db
		.collection('likes')
		.where('userHandle', '==', req.user.handle)
		.where('bugId', '==', req.params.bugId)
		.limit(1);

	const bugDoc = db.doc(`/bugs/${req.params.bugId}`);

	let bugData;

	bugDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				bugData = doc.data();
				bugData.bugId = doc.id;
				return likeDoc.get();
			} else {
				return res.status(404).json({ error: 'Bug not found' });
			}
		})
		.then(data => {
			if (data.empty) {
				return db
					.collection('likes')
					.add({
						bugId: req.params.bugId,
						userHandle: req.user.handle
					})
					.then(() => {
						bugData.likeCount++;
						return bugDoc.update({ likeCount: bugData.likeCount });
					})
					.then(() => {
						return res.json(bugData);
					});
			} else {
				return res.status(400).json({ error: 'Bug already liked' });
			}
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.unlikeBug = (req, res) => {
	const likeDoc = db
		.collection('likes')
		.where('userHandle', '==', req.user.handle)
		.where('bugId', '==', req.params.bugId)
		.limit(1);

	const bugDoc = db.doc(`/bugs/${req.params.bugId}`);

	let bugData;

	bugDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				bugData = doc.data();
				bugData.bugId = doc.id;
				return likeDoc.get();
			} else {
				return res.status(404).json({ error: 'Bug not found' });
			}
		})
		.then(data => {
			if (data.empty) {
				return res.status(400).json({ error: 'Bug never liked' });
			} else {
				return db
					.doc(`/likes/${data.docs[0].id}`)
					.delete()
					.then(() => {
						bugData.likeCount--;
						return bugDoc.update({ likeCount: bugData.likeCount });
					})
					.then(() => {
						res.json(bugData);
					});
			}
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};

exports.deleteBug = (req, res) => {
	const document = db.doc(`/bugs/${req.params.bugId}`);
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: 'Bug not found' });
			}
			if (doc.data().userHandle !== req.user.handle) {
				return res.status(403).json({ error: 'Unauthorized' });
			} else {
				return document.delete();
			}
		})
		.then(() => {
			res.json({ message: 'Bug deleted successfully' });
		})
		.catch(err => {
			res.status(500).json({ error: err.code });
			console.error(err);
		});
};
