var express = require("express");
var axios = require("axios");
var bodyParser = require("body-parser");
const marked = require("marked");
var router = express.Router();

router.use(express.json());

router.post("/message", async (req, res) => {
    if (!req.headers.authorization) {
        res.status(401).send({ message: "Unauthorized" });
        return;
    }

    const authorization = req.headers.authorization;
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: authorization,
        },
    });

    if (!response.ok) {
        res.status(401).send({ message: "Token verification failed" });
        return;
    }

    const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
            Authorization: authorization,
        },
    });

    if (!emailResponse.ok) {
        res.status(401).send({ message: "Failed to fetch email" });
        return;
    }

    const emails = await emailResponse.json();
    const primaryEmail = emails.find((email) => email.primary).email;

    const allowedEmails = process.env.ALLOWED_EMAILS.split(",");
    const allowedEmailDomains = process.env.ALLOWED_EMAIL_DOMAINS.split(",");
    if (
        !(
            allowedEmails.includes(primaryEmail) ||
            allowedEmailDomains.some((domain) => primaryEmail.endsWith(domain))
        )
    ) {
        res.status(401).send({ message: "Unauthorized email" });
        return;
    }

    const { message } = req.body;

    const chat_response = await getChatResponse(message);

    const htmlContent = marked.parse(chat_response);

    res.status(200).send({
        message: "Token verification successful",
        chatResponse: htmlContent,
    });
});

async function getChatResponse(question) {
    const server = process.env.OPEN_WEB_UI_SERVER;
    if (!server) {
        throw new Error("OPEN_WEB_UI_SERVER is not set");
    }
    const url = `${server}/api/chat/completions`;

    const key = process.env.OPEN_WEB_UI_API_KEY;
    if (!key) {
        throw new Error("OPEN_WEB_UI_API_KEY is not set");
    }

    const headers = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
    };

    const data = {
        model: "llama3.2:latest",
        messages: [{ role: "user", content: question }],
    };

    try {
        const response = await axios.post(url, data, { headers });
        const content = response.data.choices[0].message.content;

        return content;
    } catch (error) {
        console.error("Error during API request:", error);
        throw error;
    }
}

module.exports = router;
