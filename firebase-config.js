const firebaseConfig = {
    apiKey: "AIzaSyB_HE5gKNm6V-O9_ZT92AyVvpcN9PWFX6Y",
    authDomain: "japanese-notes-7f7d2.firebaseapp.com",
    projectId: "japanese-notes-7f7d2",
    storageBucket: "japanese-notes-7f7d2.firebasestorage.app",
    messagingSenderId: "185630051627",
    appId: "1:185630051627:web:55ad4eedb09746bc17096e",
    measurementId: "G-VTZ18Q6SCB"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
