// config/gridfs.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let bucket;

const initGridFS = (connection) => {
  bucket = new GridFSBucket(connection.db, {
    bucketName: 'uploads'
  });
  console.log('📦 GridFS initialized');
  return bucket;
};

const getGridFSBucket = () => {
  if (!bucket) {
    throw new Error('GridFS not initialized');
  }
  return bucket;
};

// File type validation
const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  videos: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const isFileAllowed = (mimetype) => {
  return Object.values(ALLOWED_FILE_TYPES).flat().includes(mimetype);
};

const getFileCategory = (mimetype) => {
  for (const [category, types] of Object.entries(ALLOWED_FILE_TYPES)) {
    if (types.includes(mimetype)) {
      return category;
    }
  }
  return 'other';
};

module.exports = {
  initGridFS,
  getGridFSBucket,
  isFileAllowed,
  getFileCategory,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES
};