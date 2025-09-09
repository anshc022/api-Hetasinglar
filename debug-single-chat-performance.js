#!/usr/bin/env node

/**
 * DEBUG: Single Chat Performance Analysis
 * Identifies bottlenecks in GET /:chatId endpoint
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const Chat = require('./models/Chat');
const User = require('./models/User'); 
const Escort = require('./models/Escort');

// Test the slow chat ID from the logs
const SLOW_CHAT_ID = '68bd9ff3c680003e3eb0b655';

async function analyzeChatPerformance() {
    try {
        console.log('\n🔍 SINGLE CHAT PERFORMANCE ANALYSIS');
        console.log('=====================================');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Test 1: Basic findById (no populate)
        console.log('\n📊 Test 1: Basic Chat.findById()');
        const start1 = Date.now();
        const basicChat = await Chat.findById(SLOW_CHAT_ID);
        const time1 = Date.now() - start1;
        
        if (!basicChat) {
            console.log('❌ Chat not found with ID:', SLOW_CHAT_ID);
            process.exit(1);
        }
        
        console.log(`⏱️  Basic findById: ${time1}ms`);
        console.log(`📨 Message count: ${basicChat.messages?.length || 0}`);
        console.log(`📅 Created: ${basicChat.createdAt}`);
        console.log(`🔄 Updated: ${basicChat.updatedAt}`);
        console.log(`👤 Customer ID: ${basicChat.customerId}`);
        console.log(`💃 Escort ID: ${basicChat.escortId}`);
        
        // Test 2: With customer populate only
        console.log('\n📊 Test 2: With Customer Populate');
        const start2 = Date.now();
        const chatWithCustomer = await Chat.findById(SLOW_CHAT_ID)
            .populate('customerId', 'username email dateOfBirth sex createdAt coins');
        const time2 = Date.now() - start2;
        console.log(`⏱️  With customer populate: ${time2}ms`);
        
        // Test 3: With escort populate only  
        console.log('\n📊 Test 3: With Escort Populate');
        const start3 = Date.now();
        const chatWithEscort = await Chat.findById(SLOW_CHAT_ID)
            .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth');
        const time3 = Date.now() - start3;
        console.log(`⏱️  With escort populate: ${time3}ms`);
        
        // Test 4: Full current endpoint simulation
        console.log('\n📊 Test 4: Full Current Endpoint');
        const start4 = Date.now();
        const fullChat = await Chat.findById(SLOW_CHAT_ID)
            .populate('customerId', 'username email dateOfBirth sex createdAt coins')
            .populate('escortId', 'firstName gender profileImage country region relationshipStatus interests profession height dateOfBirth');
            
        // Simulate unread count processing
        const unreadCount = fullChat.messages.filter(msg => 
            msg.sender === 'customer' && !msg.readByAgent
        ).length;
        const time4 = Date.now() - start4;
        
        console.log(`⏱️  Full endpoint simulation: ${time4}ms`);
        console.log(`📬 Unread messages: ${unreadCount}`);
        
        // Test 5: Message analysis
        console.log('\n📊 Test 5: Message Analysis');
        if (fullChat.messages) {
            console.log(`📨 Total messages: ${fullChat.messages.length}`);
            
            // Recent messages (last 24 hours)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentMessages = fullChat.messages.filter(msg => 
                new Date(msg.timestamp || msg.createdAt) > yesterday
            );
            console.log(`🆕 Recent messages (24h): ${recentMessages.length}`);
            
            // Message size analysis
            const totalMessageSize = JSON.stringify(fullChat.messages).length;
            console.log(`📏 Total message data size: ${Math.round(totalMessageSize / 1024)}KB`);
            
            // Check for large messages
            const largeMsgs = fullChat.messages.filter(msg => 
                (msg.content?.length || 0) > 1000
            );
            console.log(`🐘 Large messages (>1KB): ${largeMsgs.length}`);
        }
        
        // Test 6: Index recommendations
        console.log('\n📊 Test 6: Index Analysis');
        const indexes = await Chat.collection.getIndexes();
        console.log('Current indexes:');
        Object.keys(indexes).forEach(indexName => {
            console.log(`  - ${indexName}:`, indexes[indexName]);
        });
        
        // Performance recommendations
        console.log('\n💡 PERFORMANCE RECOMMENDATIONS');
        console.log('================================');
        
        if (time4 > 500) {
            console.log('🚨 SLOW ENDPOINT DETECTED!');
            
            if (time2 > 100) console.log('❌ Customer populate is slow - check User collection indexes');
            if (time3 > 100) console.log('❌ Escort populate is slow - check Escort collection indexes');
            if (fullChat.messages?.length > 100) {
                console.log('❌ Too many messages loaded - consider message pagination');
            }
            
            console.log('\n🔧 OPTIMIZATION STRATEGIES:');
            console.log('1. ✅ Add caching for frequently accessed chats');
            console.log('2. ✅ Limit messages returned (last N messages only)');  
            console.log('3. ✅ Use lean() queries when possible');
            console.log('4. ✅ Add compound indexes for better populate performance');
            console.log('5. ✅ Consider separate endpoint for message history');
        } else {
            console.log('✅ Endpoint performance is acceptable');
        }
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Analysis complete');
    }
}

// Run the analysis
analyzeChatPerformance().catch(console.error);
