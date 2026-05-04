const mammoth = require('mammoth');
const xlsx = require('xlsx');
const fs = require('fs');
const pdf = require('pdf-parse');
const WordExtractor = require("word-extractor");

function parseFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questions = [];
    let currentQuestion = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Even more flexible question detection: 
        // 1. 1) 1- 1.Savol etc.
        if (/^\d+[\.\)\-\s]/.test(line)) {
            if (currentQuestion && currentQuestion.options.length >= 2) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                text: line.replace(/^\d+[\.\)\-\s]*\s*/, ''),
                options: [],
                answer: null
            };
        } else if (/^[A-F][\.\)\-\s]/i.test(line)) {
            if (currentQuestion) {
                // Check if this option is marked as correct with a plus sign (e.g., +A) or + at the end
                let isCorrect = line.startsWith('+') || line.endsWith('+') || line.includes('*');
                let cleanOption = line.replace(/^[A-F][\.\)]\s*/i, '').replace(/^\+/, '').replace(/\+$/, '').replace(/\*/g, '').trim();
                
                currentQuestion.options.push(cleanOption);
                
                if (isCorrect) {
                    const match = line.match(/^[A-F]/i);
                    if (match) currentQuestion.answer = match[0].toUpperCase();
                }
            }
        } else if (/^(Javob|Answer|Correct|True|J):\s*([A-F])/i.test(line)) {
            if (currentQuestion) {
                const match = line.match(/^(Javob|Answer|Correct|True|J):\s*([A-F])/i);
                currentQuestion.answer = match[2].toUpperCase();
            }
        }
    }

    if (currentQuestion && currentQuestion.options.length >= 2) {
        questions.push(currentQuestion);
    }

    return questions;
}

async function parseWord(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return parseFromText(result.value);
}

async function parseOldWord(filePath) {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    return parseFromText(extracted.getBody());
}

async function parsePDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return parseFromText(data.text);
}

function parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    return data.map(row => {
        const text = row.Question || row.test || row.savol || row.Savol;
        const options = [
            row.A || row.a,
            row.B || row.b,
            row.C || row.c,
            row.D || row.d,
            row.E || row.e
        ].filter(Boolean);
        const answer = (row.Answer || row.javob || row.Correct || row.Javob || '').toString().trim().toUpperCase();

        return { text, options, answer };
    }).filter(q => q.text && q.options.length >= 2);
}

module.exports = { parseWord, parseOldWord, parsePDF, parseExcel };
