var express = require("express");
var axios = require("axios");
var bodyParser = require("body-parser");
const marked = require("marked");
const NodeCache = require("node-cache");
var router = express.Router();
const fs = require("fs");
const path = require("path");

router.use(express.json());

const authToEmailCache = new NodeCache({ stdTTL: 60 * 60 }); // Cache for 1 hour

async function addEmail(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        res.status(401).send({ message: "Unauthorized" });
        return;
    }

    // Check cache
    const cachedEmail = authToEmailCache.get(authorization);
    if (cachedEmail) {
        req.userEmail = cachedEmail;
        return next();
    }

    console.log("Fetching email from GitHub API");

    try {
        const userResponse = await fetch("https://api.github.com/user", {
            headers: { Authorization: authorization },
        });

        if (!userResponse.ok) {
            res.status(401).send({ message: "Token verification failed" });
            return;
        }

        const emailResponse = await fetch(
            "https://api.github.com/user/emails",
            {
                headers: { Authorization: authorization },
            }
        );

        if (!emailResponse.ok) {
            res.status(401).send({ message: "Failed to fetch email" });
            return;
        }

        const emails = await emailResponse.json();
        const primaryEmail = emails.find((email) => email.primary).email;

        authToEmailCache.set(authorization, primaryEmail);
        req.userEmail = primaryEmail;
        return next();
    } catch (error) {
        console.error("Authentication error:", error);
        res.status(500).send({ message: "Internal server error" });
    }
}

router.use(addEmail);

function addIsEmailAllowed(req, res, next) {
    const email = req.userEmail;

    const allowedEmails = process.env.ALLOWED_EMAILS.split(",");
    const allowedEmailDomains = process.env.ALLOWED_EMAIL_DOMAINS.split(",");

    if (
        !(
            allowedEmails.includes(email) ||
            allowedEmailDomains.some((domain) => email.endsWith(domain))
        )
    ) {
        console.log("Email not allowed:", email);
        res.status(403).send({ message: "Email not allowed" });
        return;
    }

    return next();
}

router.use(addIsEmailAllowed);

router.post("/message", async (req, res) => {
    const { messages } = req.body;

    if (!messages) {
        return res.status(400).send({ message: "Messages are required" });
    }

    if (!Array.isArray(messages)) {
        return res.status(400).send({ message: "Messages must be an array" });
    }

    const invalidMessage = messages.find((msg) => !msg.role || !msg.content);
    if (invalidMessage) {
        return res.status(400).send({
            message: "Each message must have 'role' and 'content' properties",
        });
    }

    try {
        const chat_response = await getChatResponse(messages);
        const htmlContent = marked.parse(chat_response);

        res.status(200).send({
            message: "success",
            chatResponse: htmlContent,
        });
    } catch (error) {
        console.error("Error processing chat message:", error);
        res.status(500).send({ message: "Internal server error" });
    }
});

const systemPrompt = fs.readFileSync("prompt.txt", "utf8");

async function getChatResponse(messages) {
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

    messages.unshift({ role: "system", content: systemPrompt });

    const data = {
        model: "llama3.2:latest",
        messages: messages,
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

router.post("/event", (req, res) => {
    const { username, event } = req.body;
    if (!username || !event) {
        return res
            .status(400)
            .send({ message: "Username and event are required" });
    }

    const isDocker = fs.existsSync("/.dockerenv");
    const baseDir = isDocker ? "/data" : path.join(__dirname, "../data");
    const userDir = path.join(baseDir, username);
    const logFile = path.join(userDir, "logs.json");

    try {
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        fs.appendFileSync(logFile, JSON.stringify(event) + "\n");
    } catch (error) {
        console.error("Error appending to log file:", error);
        return res.status(500).send({ message: "Internal server error" });
    }

    res.status(200).send({ message: "Event received" });
});

module.exports = router;
