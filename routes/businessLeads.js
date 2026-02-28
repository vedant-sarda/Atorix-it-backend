import express from "express";
import mongoose from "mongoose";
import Lead from "../models/lead.js";
import { notifyBusinessLead } from "../services/notificationService.js";
import DemoRequest from "../models/DemoRequest.js";
const router = express.Router();

// Create a new business lead
router.post("/", async (req, res) => {
  console.log('Received request to create new business lead');
  console.log('Request body:', req.body);
  
  try {
    const {
      name,
      email,
      phone,
      company = '',
      role = '',
      interests = [],
      message = '',
      source: sourceInput = 'website',
      status = 'new',
      metadata = {}
    } = req.body;
    
    console.log('Parsed fields:', { name, email, phone, company, role });
    
    // Normalize the source
    const validSources = ['website', 'api', 'import', 'manual'];
    const source = validSources.includes(sourceInput?.toLowerCase()?.trim()) 
      ? sourceInput.toLowerCase().trim() 
      : 'website';

    // Basic validation
    if (!name || !email || !phone) {
      const errorMsg = `Missing required fields: ${!name ? 'name ' : ''}${!email ? 'email ' : ''}${!phone ? 'phone' : ''}`.trim();
      console.error('Validation error:', errorMsg);
      return res.status(400).json({
        success: false,
        message: errorMsg || 'Name, email, and phone are required fields',
        receivedData: { name, email, phone, company, role }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email);
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

   
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();
   
    const existingLead = await Lead.findOne({
      $or: [
        { email: normalizedEmail },
        { phone: normalizedPhone }
      ]
    });
   
    if (existingLead) {
      console.log('❌ DUPLICATE DETECTED!');
     
      const isDuplicateEmail = existingLead.email === normalizedEmail;
      const isDuplicatePhone = existingLead.phone === normalizedPhone;
     
      let errorMessage, errorField;
     
      if (isDuplicateEmail) {
        errorMessage = 'This email address is already registered';
        errorField = 'email';
      } else if (isDuplicatePhone) {
        errorMessage = 'This phone number is already registered';
        errorField = 'phone';
      } else {
        errorMessage = 'This email or phone number is already registered';
        errorField = 'both';
      }
     
      return res.status(409).json({
        success: false,
        message: errorMessage,
        field: errorField,
        error: errorMessage
      });
    }
   
    console.log('✅ No duplicates found - proceeding with creation');
 

    // Create new lead
    const newLead = new Lead({
      name: name?.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      company: company?.trim(),
      role: role?.trim(),
      interests: Array.isArray(interests) ? interests : [interests],
      message: message?.trim(),
      source,
      status,
      metadata: {
        ...metadata,
        submittedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });
 
    // Save to database
    await newLead.save();
    await notifyBusinessLead(newLead);

    res.status(201).json({
      success: true,
      message: 'Lead submitted successfully',
      data: newLead
    });
  } catch (error) {
    console.error('❌ ERROR CREATING LEAD:', error.message);
   
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `This ${duplicateField} is already registered`,
        field: duplicateField,
        error: `This ${duplicateField} is already registered`
      });
    }
   
    res.status(500).json({
      success: false,
      message: 'Error creating lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all business leads
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;

    const skip = (page - 1) * limit;
    const filter = {
      $and: [
        { source: { $nin: ["hiring", "job_application", "career", "careers"] } },
        { position: { $exists: false } }
      ]
    };

    const total = await Lead.countDocuments(filter);

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-__v")
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: leads,
      page,
      totalPages,
      total
    });

  } catch (error) {
    console.error("❌ Fetch Leads Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch business leads"
    });
  }
});


// Get a single business lead by ID
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid lead ID format'
      });
    }

    const lead = await Lead.findById(req.params.id)
      .select('-__v')
      .lean();

    if (!lead) {
      return res.status(404).json({ 
        success: false,
        message: 'Lead not found' 
      });
    }

    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: "Error fetching lead", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});


// ✅ NEW: View a lead (mark as viewed)
router.post("/:id/view", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID format' });
    }
 
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: { viewedAt: new Date() } },
      { new: true }
    ).select('-__v').lean();
 
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
 
    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error viewing lead:', error.message);
    res.status(500).json({ success: false, message: "Error viewing lead" });
  }
});
 

// Update lead status
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedLead) {
      return res.status(404).json({ success:false });
    }

    // 🔁 Reverse sync to DemoRequest
    await DemoRequest.findOneAndUpdate(
      { email: updatedLead.email },
      { status: updatedLead.status }
    );

    res.json({
      success: true,
      data: updatedLead
    });

  } catch (err) {
    res.status(500).json({ success:false });
  }
});
 
// ✅ NEW: PUT - Full update (used by adminLeadsApi.js updateLead)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
 
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lead ID format'
      });
    }
 
    const allowedUpdates = ['status', 'name', 'email', 'phone', 'company', 'role', 'message', 'notes'];
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
 
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
 
    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-__v').lean();
 
    if (!updatedLead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
 
    res.json({
      success: true,
      message: 'Lead updated successfully',
      data: updatedLead
    });
  } catch (error) {
    console.error('Error updating lead:', error.message);
    res.status(500).json({
      success: false,
      message: "Error updating lead",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
 
// ✅ NEW: DELETE - Delete a lead (used by adminLeadsApi.js deleteLead)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
 
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lead ID format'
      });
    }
 
    const deletedLead = await Lead.findByIdAndDelete(id);
 
    if (!deletedLead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
 
    console.log('🗑️ Lead deleted successfully:', id);
 
    res.json({
      success: true,
      message: 'Lead deleted successfully',
      data: { id }
    });
  } catch (error) {
    console.error('Error deleting lead:', error.message);
    res.status(500).json({
      success: false,
      message: "Error deleting lead",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
 
// ================================
// STATS
// ================================
router.get("/stats/summary", async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = {
      total: 0,
      contacted: 0,
      qualified: 0,
      hired: 0,
    };

    stats.forEach(s => {
      summary[s._id] = s.count;
      summary.total += s.count;
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (err) {
    console.error("Stats error:", err);

    res.status(500).json({
      success: false
    });
  }
});
export default router;
