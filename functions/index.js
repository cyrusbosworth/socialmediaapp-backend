const functions = require('firebase-functions');

const express = require('express');
const app = express();
const { db } = require('./util/admin');
const FBAuth = require('./util/fbAuth');
const cors = require('cors');
const {
	getAllPosts,
	postOnePost,
	getPost,
	commentOnPost,
	followPost,
	unfollowPost,
	deletePost
} = require('./handlers/posts');
const {
	signup,
	login,
	uploadImage,
	addUserDetails,
	getAuthenticatedUser,
	getUserDetails,
	markNotificationsRead
} = require('./handlers/users');

app.use(cors());

//post routes
app.get('/posts', getAllPosts);
app.post('/post', FBAuth, postOnePost);
app.get('/post/:postId', getPost);
app.get('/post/:postId/follow', FBAuth, followPost);
app.get('/post/:postId/unfollow', FBAuth, unfollowPost);
app.delete('/post/:postId', FBAuth, deletePost);

app.post('/post/:postId/comment', FBAuth, commentOnPost);

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
			.doc(`posts/${snapshot.data().postId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'follow',
						read: false,
						postId: doc.id
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
			.doc(`posts/${snapshot.data().postId}`)
			.get()
			.then(doc => {
				if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
					return db.doc(`/notifications/${snapshot.id}`).set({
						createdAt: new Date().toISOString(),
						recipient: doc.data().userHandle,
						sender: snapshot.data().userHandle,
						type: 'comment',
						read: false,
						postId: doc.id
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
			.collection('posts')
			.where('userHandle', '==', change.before.data().handle)
			.get()

			.then(data => {
				data.forEach(doc => {
					const post = db.doc(`/posts/${doc.id}`);
					batch.update(post, { userImage: change.after.data().imageUrl });
				});
				return batch.commit();
			})
			.catch(err => console.error(err));
	} else return false;
});

exports.onPostDelete = functions.firestore
	.document('posts/{postId}')
	.onDelete((snapshot, context) => {
		const postId = context.params.postId;
		const batch = db.batch();
		return db
			.collection('comments')
			.where('postId', '==', postId)
			.get()
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/comments/${doc.id}`));
				});
				return db
					.collection('follows')
					.where('postId', '==', postId)
					.get();
			})
			.then(data => {
				data.forEach(doc => {
					batch.delete(db.doc(`/follows/${doc.id}`));
				});
				return db
					.collection('notifications')
					.where('postId', '==', postId)
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
