const functions = require('firebase-functions');

const express = require('express');
const app = express();
const { db } = require('./util/admin');
const FBAuth = require('./util/fbAuth');

const {
	getAllBugs,
	postOneBug,
	getBug,
	commentOnBug,
	followBug,
	unfollowBug,
	deleteBug
} = require('./handlers/bugs');
const {
	signup,
	login,
	uploadImage,
	addUserDetails,
	getAuthenticatedUser,
	getUserDetails,
	markNotificationsRead
} = require('./handlers/users');

//bug routes
app.get('/bugs', getAllBugs);
app.post('/bug', FBAuth, postOneBug);
app.get('/bug/:bugId', getBug);
app.get('/bug/:bugId/follow', FBAuth, followBug);
app.get('/bug/:bugId/unfollow', FBAuth, unfollowBug);
app.delete('/bug/:bugId', FBAuth, deleteBug);

app.post('/bug/:bugId/comment', FBAuth, commentOnBug);

//user routes

app.post('/user', FBAuth, addUserDetails);
app.post('/user/image', FBAuth, uploadImage);
app.get('/user/', FBAuth, getAuthenticatedUser);

app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

//signuplogin routes
app.post('/signup', signup);
app.post('/login', login);

exports.api = functions.https.onRequest(app);

exports.createNotificationOnfollow = functions.firestore
	.document('follows/{id}')
	.onCreate(snapshot => {
		return db
			.doc(`bugs/${snapshot.data().bugId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'follow',
						read: false,
						bugId: doc.id
					});
				}
			})
			.catch(err => {
				console.error(err);
			});
	});

exports.deleteNotificationOnUnfollow = functions.firestore
	.document('follows/{id}')
	.onDelete(snapshot => {
		return db
			.doc(`/notifications/${snapshot.id}`)
			.delete()

			.catch(err => {
				console.error(err);
			});
	});

exports.createNotificationOnComment = functions.firestore
	.document('comments/{id}')
	.onCreate(snapshot => {
		return db
			.doc(`bugs/${snapshot.data().bugId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'comment',
						read: false,
						bugId: doc.id
					});
				}
			})

			.catch(err => {
				console.error(err);
			});
	});

exports.onUserImageChange = functions.firestore.document('/users/{userId}').onUpdate(change => {
	if (change.before.data().imageUrl !== change.after.data().imageUrl) {
		const batch = db.batch();
		console.log('image has changed');
		return db
			.collection('bugs')
			.where('userHandle', '==', change.before.data().handle)
			.get()

			.then(data => {
				data.forEach(doc => {
					const bug = db.doc(`/bugs/${doc.id}`);
					batch.update(bug, { userImage: change.after.data().imageUrl });
				});
				return batch.commit();
			})
			.catch(err => console.error(err));
	} else return false;
});

exports.onBugDelete = functions.firestore.document('bugs/{bugId}').onDelete((snapshot, context) => {
	const bugId = context.params.bugId;
	const batch = db.batch();
	return db
		.collection('comments')
		.where('bugId', '==', bugId)
		.get()
		.then(data => {
			data.forEach(doc => {
				batch.delete(db.doc(`/comments/${doc.id}`));
			});
			return db
				.collection('follows')
				.where('bugId', '==', bugId)
				.get();
		})
		.then(data => {
			data.forEach(doc => {
				batch.delete(db.doc(`/follows/${doc.id}`));
			});
			return db
				.collection('notifications')
				.where('bugId', '==', bugId)
				.get();
		})
		.then(data => {
			data.forEach(doc => {
				batch.delete(db.doc(`/follows/${doc.id}`));
			});
			return batch.commit();
		})
		.catch(err => console.error(err));
});
