const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true
    },
    contentType: {
        type: String,
        enum: ['word', 'letter'],
        required: true,
        default: 'word'
    },
    image: {
        type: String, // Filename of the uploaded image
        default: 'default-word.png'
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'easy'
    },
    category: {
        type: String,
        default: 'general'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    child: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Child',
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
wordSchema.index({ child: 1, contentType: 1, createdAt: -1 });
wordSchema.index({ createdBy: 1 });
wordSchema.index({ contentType: 1 });
wordSchema.index({ child: 1, createdAt: -1 });

module.exports = mongoose.model('Word', wordSchema);
