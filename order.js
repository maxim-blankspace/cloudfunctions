const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.handleOrderProcessed = functions.https.onRequest(async (req, res) => {
    try {
        const userID = req.body.user.user_id;
        const receiptID = req.body.receipt.receipt_id;

        //updating users doc, that will trigger the app to render feedback tray
        await admin
            .firestore()
            .collection("service")
            .doc(userID)
            .set({current: receiptID, wasClosed: false});

        //users fcm token and language
        const userSettings = admin
            .firestore()
            .collection("settings")
            .doc(userID);

        let docRef = await userSettings.get();
        if (docRef.exists) {
            const docData = docRef.data();
            // android specific headers
            const android = {
                collapseKey: "uae_feedback",
            };

            // ios specific headers
            const apns = {
                headers: {
                    "apns-collapse-id": "uae_feedback",
                },
            };
            // const result =
            await admin.messaging().sendToDevice(docData.fcmToken, {
                android,
                apns,
                data: {
                    type: "post-order",
                },
                notification: {
                    tag: "uae_feedback",
                    body: POST_ORDER_NOTIFCATION[docData.language],
                },
            });
            // functions.logger.info("POST-ORDER:notification", result);
        }

        res.send("OK");
    } catch (e) {
        functions.logger.info("POST-ORDER:ERROR", e);
        res.send("OK");
    }
});

exports.closeFeedback = functions.https.onCall(async ({userID}) => {
    try {
        await admin
            .firestore()
            .collection("service")
            .doc(userID)
            .update({wasClosed: true});

        return "OK";
    } catch (e) {
        console.log(e);
        return "OK";
    }
});

const POST_ORDER_NOTIFCATION = {
    en: "Visit the app to check your balance, and make sure you catch our daily deals too!",
    ar: "قم بزيارة التطبيق لمعرفة رصيدك، واستفد أيضاً من عروضنا اليومية!",
};
