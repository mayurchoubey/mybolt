#!/usr/bin/env node

/**
 * Phase 1 MVP Test Script
 * 
 * This script tests the basic functionality of Phase 1:
 * - Server-side file saving
 * - Directory structure preservation
 * - Git write disabling
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Phase 1 MVP Test Script');
console.log('============================\n');

// Test 1: Check if environment variables are properly configured
console.log('1. Environment Configuration Check:');
const envVars = {
  'VITE_SERVER_CODE_SAVE_ENABLED': process.env.VITE_SERVER_CODE_SAVE_ENABLED,
  'SERVER_SAVE_BASE_PATH': process.env.SERVER_SAVE_BASE_PATH,
  'VITE_SERVER_CODE_SAVE_PATH': process.env.VITE_SERVER_CODE_SAVE_PATH,
  'VITE_DISABLE_GIT_WRITES': process.env.VITE_DISABLE_GIT_WRITES
};

Object.entries(envVars).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  console.log(`   ${status} ${key}: ${value || 'NOT SET'}`);
});

// Test 2: Check if server save base path exists and is writable
console.log('\n2. Server Base Path Check:');
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

// Test 3: Check if required files exist
console.log('\n3. Required Files Check:');
const requiredFiles = [
  'app/lib/persistence/serverFileSaver.ts',
  'app/routes/api.save-code-to-server.ts',
  'app/lib/runtime/action-runner.ts',
  'app/lib/persistence/useChatHistory.ts',
  'app/lib/hooks/useGit.ts'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  const status = exists ? '✅' : '❌';
  console.log(`   ${status} ${file}`);
});

// Test 4: Check if interceptor was removed
console.log('\n4. Interceptor Removal Check:');
const interceptorFile = 'app/lib/persistence/webcontainerFileInterceptor.ts';
const interceptorExists = fs.existsSync(interceptorFile);
const status = interceptorExists ? '❌' : '✅';
console.log(`   ${status} Interceptor file: ${interceptorExists ? 'STILL EXISTS' : 'REMOVED'}`);

console.log('\n🎯 Phase 1 MVP Test Complete!');
console.log('\nNext steps:');
console.log('1. Start the development server');
console.log('2. Create/edit files in the WebContainer');
console.log('3. Check if files are mirrored to the server base path');
console.log('4. Verify Git operations don\'t write to WebContainer');
