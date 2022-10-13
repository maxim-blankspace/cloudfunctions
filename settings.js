const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.updateSettings = functions.https.onCall(
    async ({userID, fcmToken, language}) => {
        if (!userID) {
            return "no id";
        }

        if (!["en", "ar"].includes(language)) {
            return "wrong language";
        }

        try {
            await admin
                .firestore()
                .collection("settings")
                .doc(userID)
                .set({fcmToken, language});

            return "OK";
        } catch (e) {
            console.log(e);
            return "OK";
        }
    }
);
