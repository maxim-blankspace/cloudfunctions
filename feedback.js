const functions = require("firebase-functions");
const axios = require("axios");

exports.handleFeedback = functions.https.onRequest(async (req, res) => {
    try {
        const apiURL = FEEDBACK_API_URL;
        const feedback = req.body;
        feedback.SubmitedOn = new Date(Date.now());
        feedback.SecurityToken = FEEDBACK_SECURITY_TOKEN;

        functions.logger.info("feedback:", feedback);

        axios
            .post(apiURL, JSON.stringify(feedback), {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            })
            .then(
                (response) => {
                    res.send("OK");
                    // res.send(response.data);
                    functions.logger.info("success:", response.data);
                },
                (error) => {
                    // res.send(error.response?.data?.error);
                    res.send("OK");
                    functions.logger.info("error:", error);
                }
            );
    } catch {
        res.send("OK");
    }
});

const FEEDBACK_API_URL =
    "https://prod-102.westeurope.logic.azure.com:443/workflows/5613e810b6d94196831878788945acb0/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=8kmsjwXhCuK9qnoJpsAGcpeOw9GG6bY6W-jvj6zF_9Q";

const FEEDBACK_SECURITY_TOKEN = "5dbe759f-ff13-4990-af92-26bb28a70b48";
