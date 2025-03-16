const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());

app.post("/verify-token", async (req, res) => {
    const { token } = req.body;

    try {
        const response = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (response.ok) {
            const data = await response.json();
            res.status(200).json({ valid: true, user: data });
        } else {
            res.status(response.status).json({ valid: false });
        }
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
