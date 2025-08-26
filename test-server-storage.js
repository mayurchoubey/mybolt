// Simple test script for server-side code storage
// Run this in the browser console or as a Node.js script

async function testServerStorage() {
  console.log('Testing server-side code storage...');
  
  try {
    const testData = {
      filePath: '/src/test.js',
      content: 'console.log("Hello from server storage test!");',
      serverPath: './generated-code',
      timestamp: new Date().toISOString(),
      isBinary: false
    };
    
    console.log('Sending test data:', testData);
    
    const response = await fetch('/api/save-code-to-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Test successful!', result);
    } else {
      const error = await response.json();
      console.error('❌ Test failed:', error);
    }
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Test the ServerFileSaver class
function testServerFileSaver() {
  console.log('Testing ServerFileSaver class...');
  
  // This would need to be run in the app context where the class is available
  // For now, just log the expected behavior
  console.log('Expected behavior:');
  console.log('- ServerFileSaver should be initialized in FilesStore');
  console.log('- createFile should trigger parallel server save');
  console.log('- Server save should be non-blocking');
  console.log('- User experience should remain unchanged');
}

// Run tests
console.log('🚀 Starting server-side storage tests...');
testServerStorage();
testServerFileSaver();
