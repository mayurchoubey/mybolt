#!/usr/bin/env node

/**
 * Server-Only Storage MVP Test Script
 * 
 * This script tests the new MVP feature that allows switching off
 * WebContainer file writes and only saving to server storage.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Server-Only Storage MVP Test Script');
console.log('=======================================\n');

// Test 1: Check if environment variables are properly configured
console.log('1. Environment Configuration Check:');
const envVars = {
  'VITE_SERVER_CODE_SAVE_ENABLED': process.env.VITE_SERVER_CODE_SAVE_ENABLED,
  'SERVER_SAVE_BASE_PATH': process.env.SERVER_SAVE_BASE_PATH,
  'VITE_SERVER_CODE_SAVE_PATH': process.env.VITE_SERVER_CODE_SAVE_PATH,
  'VITE_DISABLE_GIT_WRITES': process.env.VITE_DISABLE_GIT_WRITES,
  'VITE_SERVER_ONLY_STORAGE': process.env.VITE_SERVER_ONLY_STORAGE
};

Object.entries(envVars).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  console.log(`   ${status} ${key}: ${value || 'NOT SET'}`);
});

// Test 2: Check if required files exist and have been modified
console.log('\n2. Required Files Check:');
const requiredFiles = [
  'app/lib/persistence/serverFileSaver.ts',
  'app/lib/stores/files.ts',
  'app/lib/runtime/action-runner.ts',
  'app/lib/persistence/useChatHistory.ts',
  'app/routes/api.save-code-to-server.ts'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  const status = exists ? '✅' : '❌';
  console.log(`   ${status} ${file}`);
});

// Test 3: Check for specific MVP implementation patterns
console.log('\n3. MVP Implementation Check:');
const mvpPatterns = [
  {
    file: 'app/lib/persistence/serverFileSaver.ts',
    patterns: ['isServerOnlyMode', 'VITE_SERVER_ONLY_STORAGE']
  },
  {
    file: 'app/lib/stores/files.ts',
    patterns: ['isServerOnlyMode', 'webcontainer.fs.writeFile']
  },
  {
    file: 'app/lib/runtime/action-runner.ts',
    patterns: ['isServerOnlyMode', 'webcontainer.fs.writeFile']
  },
  {
    file: 'app/lib/persistence/useChatHistory.ts',
    patterns: ['isServerOnlyMode', 'container.fs.writeFile']
  }
];

mvpPatterns.forEach(({ file, patterns }) => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const hasPatterns = patterns.every(pattern => content.includes(pattern));
    const status = hasPatterns ? '✅' : '❌';
    console.log(`   ${status} ${file}: MVP patterns found`);
  } else {
    console.log(`   ❌ ${file}: File not found`);
  }
});

// Test 4: Check environment example file
console.log('\n4. Environment Configuration Check:');
const envExampleFile = '.env.local.example';
if (fs.existsSync(envExampleFile)) {
  const content = fs.readFileSync(envExampleFile, 'utf8');
  const hasServerOnlyFlag = content.includes('VITE_SERVER_ONLY_STORAGE');
  const status = hasServerOnlyFlag ? '✅' : '❌';
  console.log(`   ${status} ${envExampleFile}: Server-only flag documented`);
} else {
  console.log(`   ❌ ${envExampleFile}: File not found`);
}

// Test 5: Server base path check
console.log('\n5. Server Base Path Check:');
const basePath = process.env.SERVER_SAVE_BASE_PATH || process.env.VITE_SERVER_CODE_SAVE_PATH || '~/bolt-generated-code';
const resolvedPath = basePath.startsWith('~/') ? path.join(process.env.HOME, basePath.slice(2)) : basePath;

try {
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
    console.log(`   ✅ Created directory: ${resolvedPath}`);
  } else {
    console.log(`   ✅ Directory exists: ${resolvedPath}`);
  }
  
  // Test write permission
  const testFile = path.join(resolvedPath, '.test-write');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log(`   ✅ Write permission: OK`);
} catch (error) {
  console.log(`   ❌ Directory error: ${error.message}`);
}

console.log('\n🎯 Server-Only Storage MVP Test Complete!');
console.log('\nHow to test:');
console.log('1. Set VITE_SERVER_ONLY_STORAGE=true in .env.local');
console.log('2. Start the development server');
console.log('3. Create/edit files in the WebContainer');
console.log('4. Check server storage: files should appear in ~/bolt-generated-code/[uuid]/');
console.log('5. Check WebContainer: files should NOT be written there');
console.log('6. Set VITE_SERVER_ONLY_STORAGE=false to restore dual-write mode');
