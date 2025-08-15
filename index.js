const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const express = require("express");

// ---------- Keep-alive server ----------
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(3000, () => console.log("✅ Keep-alive server running"));

// ---------- Discord Bot ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.BOT_TOKEN;

// ---------- Admin Config ----------
const adminUserIds = ["613363104130269204"];
const dataFilePath = path.join(__dirname, "group_data.json");
let groupData = {};
if (fs.existsSync(dataFilePath)) {
    groupData = JSON.parse(fs.readFileSync(dataFilePath, "utf-8"));
}

function saveGroupData() {
    fs.writeFileSync(dataFilePath, JSON.stringify(groupData, null, 2));
}

// ---------- Reset daily limits at 19:30 UTC ----------
let lastResetDate = null;
setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 19 && now.getUTCMinutes() === 30) {
        const today = now.toDateString();
        if (lastResetDate !== today) {
            for (const groupId in groupData) {
                groupData[groupId].remaining = groupData[groupId].limit;
            }
            saveGroupData();
            lastResetDate = today;
            console.log("✅ Daily limits reset.");
        }
    }
}, 60 * 1000);

// ---------- Bot Ready ----------
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    try {
        await client.user.setUsername("MrX-Bot");
        console.log("✅ Bot username changed to MrX-Bot");
    } catch (error) {
        console.error("❌ Could not change bot username:", error);
    }
});

// ---------- Command Handler ----------
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const chatId = message.channel.id;

    // ---------- Admin Commands ----------
    if (["!allow", "!remove", "!check"].includes(command)) {
        if (!adminUserIds.includes(message.author.id))
            return message.reply("❌ You are not authorized.");

        const groupId = args[0];
        if (!groupId) return message.reply("Please provide a group ID.");

        if (command === "!allow") {
            const limit = parseInt(args[1]);
            if (!limit) return message.reply("Please provide a valid limit number.");
            groupData[groupId] = { limit: limit, remaining: limit };
            saveGroupData();
            return message.reply(`✅ Group ${groupId} allowed with daily limit: ${limit}`);
        }

        if (command === "!remove") {
            if (groupData[groupId]) {
                delete groupData[groupId];
                saveGroupData();
                return message.reply(`✅ Group ${groupId} removed.`);
            } else return message.reply("❌ Group not found.");
        }

        if (command === "!check") {
            if (groupData[groupId]) {
                return message.reply(`Group ${groupId} has ${groupData[groupId].remaining} requests remaining today.`);
            } else return message.reply("❌ Group not found.");
        }
    }

    // ---------- Help Command ----------
    if (command === "!help") {
        const validRegions = ['SG','BD','ME','EU','TW','TH','VN','IND','BR','SAC','NA','RU'];
        const helpEmbed = new EmbedBuilder()
            .setColor(0x1ABC9C)
            .setTitle("🚀 MrX-Bot Help Menu")
            .setDescription("💡 **Welcome! Here's how to use MrX-Bot:**")
            .addFields(
                { name: "🎮 Player Info", value: "**`!info <region> <player_id>`**\nGet player stats.\nExample: `!info ME 1234567890`", inline: true },
                { name: "❤️ Give Likes", value: "**`!like <region> <player_id>`**\nGive likes to a player.\nExample: `!like ME 1234567890`", inline: true },
                { name: "🛡️ Admin Commands", value: "**`!allow <group_id> <limit>`**\n**`!remove <group_id>`**\n**`!check <group_id>`**", inline: false },
                { name: "🌍 Supported Regions", value: validRegions.map(r => `\`${r}\``).join(" | "), inline: false }
            )
            .setFooter({ text: "MrX-Bot • Made with ❤️ by MrX", iconURL: client.user.avatarURL() })
            .setTimestamp();
        return message.reply({ embeds: [helpEmbed] });
    }

    // ---------- Info Command ----------
    if (command === "!info") {
        const ALLOWED_CHANNEL = "1301201241120178246";
        if (message.channel.id !== ALLOWED_CHANNEL) return message.reply("❌ This group is not authorized.");
        if (args.length !== 2) return message.reply("Usage: `!info <region> <player_id>`");

        let [region, playerId] = args;
        region = region.toUpperCase();

        try {
            const res = await axios.get(`https://apifreefire-ashen.vercel.app/info/${region}/${playerId}?token_key=guest_token_1`);
            const data = res.data;
            if (!data?.basicInfo) return message.reply(data?.message || "❌ Player not found.");

            const b = data.basicInfo;
            const embed = new EmbedBuilder()
                .setColor(0x1ABC9C)
                .setTitle(`🎮 Player Info: ${b.Name || "Unknown"} (${b.UID})`)
                .setDescription(`🌍 Region: ${b.Region} | 🏅 Level: ${b.Level} | 🥇 Rank: ${b.Rank} | ❤️ Likes: ${b.Like}`)
                .setFooter({ text: "MrX-Bot • Free Fire Player Info" })
                .setTimestamp();
            message.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            return message.reply("❌ Error fetching player info.");
        }
    }

    // ---------- Like Command ----------
    if (command === "!like") {
        if (!groupData[chatId]) return message.reply("❌ This group is not authorized.");
        if (groupData[chatId].remaining <= 0) return message.reply("⚠️ Daily limit reached.");
        if (args.length !== 2) return message.reply("Usage: `!like <region> <player_id>`");

        let [userRegion, playerId] = args;
        userRegion = userRegion.toUpperCase();

        try {
            const infoRes = await axios.get(`https://apifreefire-ashen.vercel.app/info/${userRegion}/${playerId}?token_key=guest_token_1`);
            const playerInfo = infoRes.data;
            if (!playerInfo?.basicInfo) return message.reply(playerInfo?.message || "❌ Player not found.");

            const actualRegion = playerInfo.basicInfo.Region.toUpperCase();
            const likesBefore = playerInfo.basicInfo.Like || 0;

            const now = new Date();
            const lastLike = groupData[chatId].lastLike?.[playerId] ? new Date(groupData[chatId].lastLike[playerId]) : null;
            if (lastLike && (now - lastLike) < 24*60*60*1000) {
                const hoursLeft = Math.floor((24*60*60*1000 - (now - lastLike)) / (60*60*1000));
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle("⚠️ Cooldown Active")
                    .setDescription(`You already liked this player.\nWait **${hoursLeft} hour(s)**.`)
                    .setFooter({ text: "MrX-Bot • Free Fire Like System", iconURL: client.user.avatarURL() })
                    .setTimestamp();
                return message.reply({ embeds: [cooldownEmbed] });
            }

            const likeRes = await axios.get(`https://apifreefire-ashen.vercel.app/like/${actualRegion}/${playerId}`);
            const successCount = likeRes.data.success_count || 0;
            const errorCount = likeRes.data.error_count || 0;

            const infoResAfter = await axios.get(`https://apifreefire-ashen.vercel.app/info/${actualRegion}/${playerId}?token_key=guest_token_1`);
            const likesAfter = infoResAfter.data.basicInfo?.Like || likesBefore;

            const embed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle(`🎮 Likes Update for Player ID: ${playerId}`)
                .setDescription(`🌍 Region: ${actualRegion}`)
                .addFields(
                    { name: "❤️ Likes Before", value: `${likesBefore}`, inline: true },
                    { name: "❤️ Likes After", value: `${likesAfter}`, inline: true },
                    { name: "✅ Likes Given By Bot", value: `${successCount}`, inline: true },
                    { name: "⚠️ Errors", value: `${errorCount}`, inline: true }
                )
                .setFooter({ text: "MrX-Bot • Free Fire Like System", iconURL: client.user.avatarURL() })
                .setTimestamp();
            await message.reply({ embeds: [embed] });

            groupData[chatId].lastLike = groupData[chatId].lastLike || {};
            groupData[chatId].lastLike[playerId] = now.toISOString();
            groupData[chatId].remaining -= 1;
            saveGroupData();

        } catch (err) {
            console.error(err);
            return message.reply("❌ Unknown error occurred while processing !like.");
        }
    }

});

// ---------- Login ----------
client.login(TOKEN);
