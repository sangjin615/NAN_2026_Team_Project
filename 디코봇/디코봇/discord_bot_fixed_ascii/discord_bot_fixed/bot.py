import json
import os
import re
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import discord
from discord.ext import commands
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
KST = ZoneInfo("Asia/Seoul")
EXPORTS = BASE_DIR / "exports"
MAX_UPLOAD = 8 * 1024 * 1024

if not TOKEN or TOKEN in {
    "YOUR_REAL_BOT_TOKEN",
    "여기에_실제_봇_토큰",
    "여기에_봇_토큰_입력",
    "실제_봇_토큰",
}:
    raise RuntimeError(
        "The .env file does not contain a valid DISCORD_BOT_TOKEN."
    )


def safe_name(text: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", text)
    return cleaned.strip(" ._")[:80] or "channel"


def to_record(message: discord.Message) -> dict:
    kst_time = message.created_at.astimezone(KST)
    return {
        "message_id": str(message.id),
        "server": message.guild.name if message.guild else "DM",
        "channel": getattr(message.channel, "name", str(message.channel)),
        "author": message.author.display_name,
        "author_username": str(message.author),
        "created_at_kst": kst_time.isoformat(),
        "content": message.content,
        "reply_to_message_id": (
            str(message.reference.message_id)
            if message.reference and message.reference.message_id
            else None
        ),
        "attachments": [
            {
                "filename": a.filename,
                "url": a.url,
                "size": a.size,
                "content_type": a.content_type,
            }
            for a in message.attachments
        ],
    }


def md_message(record: dict) -> str:
    time_text = datetime.fromisoformat(record["created_at_kst"]).strftime("%H:%M:%S")
    content = record["content"] or "_No text content_"
    parts = [f"## {time_text} — {record['author']}", "", content, ""]

    if record["reply_to_message_id"]:
        parts += [
            f"> Reply target message ID: `{record['reply_to_message_id']}`",
            "",
        ]

    if record["attachments"]:
        parts += ["**Attachments**", ""]
        for item in record["attachments"]:
            parts.append(f"- [{item['filename']}]({item['url']})")
        parts.append("")

    return "\n".join(parts)


async def export_channel(channel):
    now_text = datetime.now(KST).strftime("%Y%m%d_%H%M%S")
    folder = EXPORTS / safe_name(channel.guild.name) / safe_name(channel.name) / now_text
    folder.mkdir(parents=True, exist_ok=True)

    records = []
    grouped = defaultdict(list)

    async for message in channel.history(limit=None, oldest_first=True):
        record = to_record(message)
        records.append(record)
        date_text = datetime.fromisoformat(
            record["created_at_kst"]
        ).strftime("%Y-%m-%d")
        grouped[date_text].append(record)

    with (folder / "all_messages.json").open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    with (folder / "all_messages.jsonl").open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    for date_text, day_records in sorted(grouped.items()):
        lines = [
            f"# {date_text} — #{channel.name}",
            "",
            f"- Server: {channel.guild.name}",
            f"- Message count: {len(day_records)}",
            "",
        ]
        for record in day_records:
            lines.append(md_message(record))
        (folder / f"{date_text}.md").write_text(
            "\n".join(lines),
            encoding="utf-8",
        )

    (folder / "README.md").write_text(
        "\n".join([
            "# Discord Channel Export",
            "",
            f"- Server: {channel.guild.name}",
            f"- Channel: #{channel.name}",
            f"- Total messages: {len(records)}",
            "",
            "This folder contains daily Markdown files and complete JSON/JSONL files.",
        ]),
        encoding="utf-8",
    )

    zip_base = folder.parent / f"{safe_name(channel.name)}_{now_text}"
    zip_path = Path(shutil.make_archive(str(zip_base), "zip", folder))
    return zip_path, len(records)


intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print()
    print("=" * 58)
    print(f"ONLINE: {bot.user}")
    print("In Discord, type: !ping")
    print("To export the current channel, type: !export_current")
    print("Do not close this window while using the bot.")
    print("=" * 58)
    print()


@bot.command()
async def ping(ctx):
    await ctx.send("The bot is running normally.")


@bot.command()
@commands.guild_only()
async def export_current(ctx):
    channel = ctx.channel
    if not isinstance(channel, (discord.TextChannel, discord.Thread)):
        await ctx.send("Run this command in a server text channel.")
        return

    status = await ctx.send("Reading all available messages in this channel...")

    try:
        zip_path, count = await export_channel(channel)

        if zip_path.stat().st_size <= MAX_UPLOAD:
            await ctx.send(
                f"Done. Exported {count} messages.",
                file=discord.File(zip_path),
            )
        else:
            await ctx.send(
                f"Done. Exported {count} messages.\n"
                f"The ZIP is too large to upload. It was saved here:\n"
                f"`{zip_path}`"
            )
        await status.delete()
    except discord.Forbidden:
        await status.edit(
            content=(
                "Permission denied. The bot needs View Channel, "
                "Read Message History, Send Messages, and Attach Files."
            )
        )
    except Exception as exc:
        await status.edit(content=f"Export failed: `{type(exc).__name__}: {exc}`")


bot.run(TOKEN)
