require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mammoth = require('mammoth');
const { parseWord, parseOldWord, parsePDF, parseExcel } = require('./parser');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Create downloads folder if not exists
if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

// Connect to MongoDB
db.connectDB();

bot.start(async (ctx) => {
    const user = await db.getUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    const total = await db.getTotalQuestions();
    ctx.replyWithHTML(
        `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n` +
        `Bu bot orqali siz testlarni yechishingiz mumkin.\n\n` +
        `📊 <b>Hozirgi holat:</b>\n` +
        `✅ To'g'ri javoblar: ${user.score}\n` +
        `📝 Jami savollar: ${total}\n\n` +
        `Testni boshlash uchun /quiz buyrug'ini bosing.\n` +
        `Yangi test yuklash uchun (faqat admin) Word yoki Excel fayl yuboring.`
    );
});

bot.command('quiz', async (ctx) => {
    sendQuestion(ctx);
});

bot.command('reset', async (ctx) => {
    await db.resetUserProgress(ctx.from.id);
    ctx.reply('🔄 Progress nolga tushirildi. /quiz orqali qaytadan boshlashingiz mumkin.');
});

async function sendQuestion(ctx) {
    const question = await db.getNextQuestion(ctx.from.id);
    const total = await db.getTotalQuestions();
    
    if (!question) {
        return ctx.reply('🎉 Tabriklaymiz! Siz barcha savollarga javob berdingiz.');
    }

    const alphabet = ['A', 'B', 'C', 'D', 'E', 'F'];
    const buttons = question.options.map((opt, index) => {
        return [Markup.button.callback(`${alphabet[index]}) ${opt}`, `answer_${question._id}_${alphabet[index]}`)];
    });

    ctx.replyWithHTML(
        `❓ <b>Savol:</b>\n${question.text}\n\n` +
        `<i>Progress: ${question.options.length > 0 ? 'Davom etmoqda...' : ''}</i>`,
        Markup.inlineKeyboard(buttons)
    );
}

bot.action(/^answer_([a-f\d]+)_([A-F])$/, async (ctx) => {
    const questionId = ctx.match[1];
    const selectedAnswer = ctx.match[2];
    
    const question = await db.getQuestionById(questionId);
    if (!question) return ctx.answerCbQuery('Xatolik: Savol topilmadi.');

    const isCorrect = question.answer === selectedAnswer;
    await db.updateProgress(ctx.from.id, questionId, isCorrect);

    if (isCorrect) {
        await ctx.answerCbQuery('✅ To\'g\'ri!');
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n✅ <b>To'g'ri javob: ${selectedAnswer}</b>`, { parse_mode: 'HTML' });
    } else {
        await ctx.answerCbQuery('❌ Noto\'g\'ri');
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n❌ <b>Sizning javobingiz: ${selectedAnswer}</b>\n✅ <b>To'g'ri javob: ${question.answer}</b>`, { parse_mode: 'HTML' });
    }

    setTimeout(() => {
        sendQuestion(ctx);
    }, 1000);
});

bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
        return ctx.reply('⚠️ Sizda fayl yuklash huquqi yo\'q.');
    }

    const fileId = ctx.message.document.file_id;
    const fileName = ctx.message.document.file_name;
    const fileUrl = await bot.telegram.getFileLink(fileId);
    
    const filePath = path.join(__dirname, 'downloads', fileName);
    const response = await axios({ url: fileUrl.href, responseType: 'stream' });
    
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    writer.on('finish', async () => {
        ctx.reply('⏳ Fayl qabul qilindi, tahlil qilinmoqda...');
        
        try {
            let questions = [];
            if (fileName.endsWith('.docx')) {
                questions = await parseWord(filePath);
            } else if (fileName.endsWith('.doc')) {
                questions = await parseOldWord(filePath);
            } else if (fileName.endsWith('.pdf')) {
                questions = await parsePDF(filePath);
            } else if (fileName.endsWith('.xlsx')) {
                questions = parseExcel(filePath);
            } else {
                return ctx.reply('❌ Faqat .docx, .doc, .pdf yoki .xlsx fayllar qabul qilinadi.');
            }

            const count = await db.saveQuestions(questions);
            
            if (count === 0) {
                let debugText = "";
                try {
                    if (fileName.endsWith('.docx')) debugText = (await mammoth.extractRawText({ path: filePath })).value;
                    else if (fileName.endsWith('.doc')) debugText = (await (new (require("word-extractor"))()).extract(filePath)).getBody();
                    else if (fileName.endsWith('.pdf')) debugText = (await (require('pdf-parse'))(fs.readFileSync(filePath))).text;
                } catch (e) { debugText = "Matnni o'qib bo'lmadi."; }

                const snippet = debugText.substring(0, 500).replace(/[\n\r]+/g, ' ');
                return ctx.reply(`❌ Savollar bazaga saqlanmadi (0 ta). \n\nBot o'qigan matndan parcha:\n"${snippet}..." \n\nIltimos, formatni tekshiring. Savol raqam bilan, javob esa 'Javob: A' ko'rinishida bo'lishi kerak.`);
            }

            ctx.reply(`✅ Muvaffaqiyatli yuklandi! ${count} ta savol bazaga saqlandi.\n\n/quiz buyrug'ini bosing.`);
        } catch (error) {
            console.error(error);
            ctx.reply('❌ Faylni o\'qishda xatolik yuz berdi.');
        }
    });
});

bot.launch().then(() => {
    console.log('🤖 Bot ishga tushdi!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
