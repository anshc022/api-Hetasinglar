// Temporary API endpoint to fix escort assignment
const express = require('express');
const router = express.Router();
const EscortProfile = require('../models/EscortProfile');
const mongoose = require('mongoose');

// Fix escort assignment - assign escort to specific agent
router.post('/fix-escort-assignment', async (req, res) => {
  try {
    console.log('🔧 Fixing escort assignment...');
    
    const escortId = '689bac40be47938f4778b1ab'; // StandigtVatkat
    const newAgentId = '68b1e280f48f75cefabf1cb1'; // Ansh
    
    console.log('🔍 Looking for escort:', escortId);
    console.log('🔍 Assigning to agent:', newAgentId);
    
    const escort = await EscortProfile.findById(escortId);
    if (!escort) {
      return res.status(404).json({ error: 'Escort not found' });
    }
    
    console.log('📋 Current escort details:');
    console.log('  - Username:', escort.username);
    console.log('  - Current creator:', escort.createdBy);
    
    const result = await EscortProfile.updateOne(
      { _id: escortId },
      { 
        $set: { 
          'createdBy.id': new mongoose.Types.ObjectId(newAgentId),
          'createdBy.type': 'Agent'
        } 
      }
    );
    
    console.log('✅ Update result:', result);
    
    // Verify the update
    const updatedEscort = await EscortProfile.findById(escortId);
    console.log('📋 Updated escort details:');
    console.log('  - Username:', updatedEscort.username);
    console.log('  - New creator:', updatedEscort.createdBy);
    
    res.json({ 
      success: true, 
      message: 'Escort assignment fixed',
      before: escort.createdBy,
      after: updatedEscort.createdBy,
      updateResult: result
    });
    
  } catch (error) {
    console.error('❌ Error fixing escort assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
