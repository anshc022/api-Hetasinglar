// This script will fix the message deletion issue
// Run this to update your message deletion logic

const fs = require('fs');
const path = require('path');

// Function to fix message deletion in server files
function fixMessageDeletion() {
  const filesToCheck = [
    './server.js',
    './routes/agentRoutes.js',
    './routes/adminRoutes.js',
    './routes/userRoutes.js',
    './routes/clientRoutes.js'
  ];

  filesToCheck.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace all instances of the problematic deletion text
      const patterns = [
        /message\.content\s*=\s*['"`]This message has been deleted['"`]/g,
        /message\.content\s*=\s*['"`]Message deleted['"`]/g,
        /message\.content\s*=\s*['"`]\[deleted\]['"`]/g
      ];
      
      patterns.forEach(pattern => {
        content = content.replace(pattern, 'message.content = null');
      });
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed message deletion in ${filePath}`);
    }
  });
}

// Frontend fix for message display
const frontendFix = `
// Add this to your message display component to properly handle deleted messages

const MessageItem = ({ message, isAdmin = false }) => {
  // Don't show deleted messages to regular users
  if (message.isDeleted && !isAdmin) {
    return null;
  }
  
  // Show special indicator for admins only
  if (message.isDeleted && isAdmin) {
    return (
      <div className="message-deleted admin-view">
        <span className="text-gray-500 italic">
          [Message deleted at {new Date(message.deletedAt).toLocaleString()}]
        </span>
      </div>
    );
  }
  
  // Regular message display
  return (
    <div className="message">
      <p>{message.content}</p>
      {/* Your other message content */}
    </div>
  );
};

// Update your message fetching to filter deleted messages for non-admins
const fetchMessages = async (chatId, isAdmin = false) => {
  try {
    const response = await fetch(\`/api/messages/\${chatId}\`);
    const messages = await response.json();
    
    // Filter out deleted messages for non-admin users
    if (!isAdmin) {
      return messages.filter(msg => !msg.isDeleted);
    }
    
    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};
`;

console.log('Frontend fix code:');
console.log(frontendFix);

// Run the fix
fixMessageDeletion();