const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: Number, // Telegram ID
    username: String,
    first_name: String,
    current_test_id: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    answered_questions: [mongoose.Schema.Types.ObjectId] // Track answered questions
});

const questionSchema = new mongoose.Schema({
    text: String,
    options: [String],
    answer: String
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB-ga ulanish hosil qilindi!');
    } catch (err) {
        console.error('❌ MongoDB-ga ulanishda xatolik:', err);
    }
}

async function saveQuestions(questions) {
    // Filter valid questions
    const validQuestions = questions.filter(q => q.text && q.options && q.options.length >= 2 && q.answer);
    
    // Clear old questions
    await Question.deleteMany({});
    
    // Insert new ones
    const docs = await Question.insertMany(validQuestions);
    return docs.length;
}

async function getUser(id, username, first_name) {
    let user = await User.findById(id);
    if (!user) {
        user = await User.create({ _id: id, username, first_name });
    }
    return user;
}

async function updateProgress(userId, questionId, isCorrect) {
    const update = {
        $addToSet: { answered_questions: questionId }
    };
    if (isCorrect) {
        update.$inc = { score: 1 };
    }
    await User.findByIdAndUpdate(userId, update);
}

async function getNextQuestion(userId) {
    const user = await User.findById(userId);
    // Find a question that is NOT in the user's answered_questions list
    return await Question.findOne({ _id: { $nin: user.answered_questions } }).sort({ _id: 1 });
}

async function getTotalQuestions() {
    return await Question.countDocuments();
}

async function resetUserProgress(userId) {
    await User.findByIdAndUpdate(userId, { 
        score: 0, 
        answered_questions: [] 
    });
}

async function getQuestionById(id) {
    return await Question.findById(id);
}

module.exports = {
    connectDB,
    saveQuestions,
    getUser,
    updateProgress,
    getNextQuestion,
    getTotalQuestions,
    resetUserProgress,
    getQuestionById
};
