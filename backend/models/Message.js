// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    trim: true
    // NOT required - can send files without text
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderEmail: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true,
    index: true
  },
  isDM: {
    type: Boolean,
    default: false
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // File attachment fields
  hasAttachment: {
    type: Boolean,
    default: false
  },
  attachment: {
    fileId: mongoose.Schema.Types.ObjectId,
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    category: String, // 'images', 'videos', 'documents', 'audio'
    url: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Custom validation: either text or attachment must be present
messageSchema.pre('validate', function(next) {
  if (!this.text && !this.hasAttachment) {
    this.invalidate('text', 'Either text or attachment must be provided');
  }
  next();
});

// Index for efficient queries
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ participants: 1, isDM: 1, createdAt: -1 });
messageSchema.index({ 'attachment.fileId': 1 });

module.exports = mongoose.model('Message', messageSchema);