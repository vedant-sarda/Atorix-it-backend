import mongoose from 'mongoose';
 
const jobApplicationSchema = new mongoose.Schema({
  // Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
 
  // Position Details
  position: {
    type: String,
    required: [true, 'Position is required']
  },
  experience: {
    type: String,
    default: ''
  },
  currentCompany: {
    type: String,
    default: ''
  },
  expectedSalary: {
    type: Number,
    default: null
  },
  noticePeriod: {
    type: String,
    default: ''
  },
  coverLetter: {
    type: String,
    default: ''
  },
  startDate: {
    type: Date,
    default: null
  },
 
  // Education & Experience
  education: {
    type: String,
    default: ''
  },
  skills: {
    type: [String],
    default: []
  },
 
// Resume – Cloudinary
resumePath: {
  type: String,
  default: ''   // Cloudinary secure URL (for direct browser preview)
},
resumeFileId: {
  type: String,
  default: ''   // Cloudinary public_id (used to delete the file from Cloudinary)
},
 
  // Source of application
  source: {
    type: String,
    default: 'Career Portal',
    trim: true
  },
 
  // Status
  status: {
    type: String,
    enum: [
      'applied',
      'reviewed',
      'contacted',
      'interview',
      'hired',
      'rejected',
      'new'
    ],
    default: 'applied'
  },
 
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  autoIndex: true
});
 
// Text indexes for search
jobApplicationSchema.index({ fullName: 'text', email: 'text', position: 'text' });
 
const JobApplication = mongoose.models.JobApplication || mongoose.model('JobApplication', jobApplicationSchema);
 
export default JobApplication;
 