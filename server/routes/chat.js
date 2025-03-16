var express = require("express");
var axios = require("axios");
var bodyParser = require("body-parser");
var router = express.Router();

router.use(express.json());

router.post("/message", async (req, res) => {
    console.log(req);

    if (!req.headers.authorization) {
        res.status(401).send({ message: "Unauthorized" });
        return;
    }

    const authorization = req.headers.authorization;
    const response = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': authorization
        }
    });

    if (!response.ok) {
        res.status(401).send({ message: "Token verification failed" });
        return;
    }

    const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
            'Authorization': authorization
        }
    });

    if (!emailResponse.ok) {
        res.status(401).send({ message: "Failed to fetch email" });
        return;
    }

    const emails = await emailResponse.json();
    const primaryEmail = emails.find(email => email.primary).email;

    if (!(primaryEmail === "risseeuw.stijn@gmail.com" || primaryEmail.endsWith("@stanislascollege.net"))) {
        res.status(401).send({ message: "Unauthorized email" });
        return;
    }

    const { message } = req.body;

    const chat_response = await getChatResponse(message);

    res.status(200).send({
        message: "Token verification successful",
        chatResponse: chat_response,
    });
});

async function getChatResponse(string) {
    return "kaas to (" + string + ")";
}

module.exports = router;
