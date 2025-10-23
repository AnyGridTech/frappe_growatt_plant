const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Find all doctype folders with ts/ subdirectories
function findDoctypesWithTS(baseDir) {
  const doctypes = [];
  const doctypeDir = path.join(baseDir, 'growatt_plant/doctype');
  
  if (!fs.existsSync(doctypeDir)) return doctypes;
  
  const folders = fs.readdirSync(doctypeDir);
  
  for (const folder of folders) {
    const tsPath = path.join(doctypeDir, folder, 'ts');
    
    if (!fs.existsSync(tsPath)) continue;
    
    // Find all .ts files (not .d.ts) - get just filenames
    const tsFiles = fs.readdirSync(tsPath)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    
    if (tsFiles.length > 0) {
      doctypes.push({
        name: folder,
        tsPath: tsPath,
        tsFiles: tsFiles,
        output: path.relative(baseDir, path.join(doctypeDir, folder, `${folder}.js`))
      });
    }
  }
  
  return doctypes;
}

// Build a single doctype
function buildDoctype(doctype, watch = false) {
  // Create a temporary entry file that imports all .ts files
  const tempEntry = path.join(doctype.tsPath, '__bundle_entry__.ts');
  const imports = doctype.tsFiles
    .map(f => `import "./${f.replace('.ts', '')}";`)
    .join('\n');
  
  fs.writeFileSync(tempEntry, imports);
  
  const cmd = [
    'npx esbuild',
    path.relative(process.cwd(), tempEntry),
    '--bundle',
    `--outfile=${doctype.output}`,
    '--format=iife',
    '--external:frappe',
    '--external:jquery',
    '--banner:js="// Copyright (c) 2025, AnyGridTech and contributors\\n// For license information, please see license.txt"',
    watch ? '--watch' : ''
  ].filter(Boolean).join(' ');
  
  console.log(`Building ${doctype.name} (${doctype.tsFiles.length} file(s))...`);
  
  try {
    if (watch) {
      // Spawn watch process (don't wait)
      const proc = spawn(cmd, { shell: true, stdio: 'inherit' });
      // Clean up temp file on exit
      proc.on('exit', () => {
        if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
      });
    } else {
      // Sync build
      execSync(cmd, { stdio: 'inherit' });
      // Clean up temp file
      if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
    }
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
    throw error;
  }
}

// Start TypeScript type-checker in watch mode
function startTypeChecker(baseDir) {
  const tsconfigPath = path.join(baseDir, 'tsconfig.base.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    console.warn('⚠️  tsconfig.base.json not found, skipping type-checking');
    return;
  }
  
  console.log('Starting TypeScript type-checker...');
  const proc = spawn('npx', ['tsc', '--noEmit', '-p', tsconfigPath, '--watch'], {
    stdio: 'inherit',
    shell: true
  });
  
  return proc;
}

// Main
const isWatch = process.argv.includes('--watch');
const withTypeCheck = process.argv.includes('--typecheck') || isWatch;
const baseDir = __dirname;
const doctypes = findDoctypesWithTS(baseDir);

if (doctypes.length === 0) {
  console.log('No DocTypes with ts/ folders found');
  process.exit(0);
}

console.log(`Found ${doctypes.length} DocType(s) with TypeScript:`);
doctypes.forEach(dt => console.log(`  - ${dt.name} (${dt.tsFiles.length} file(s))`));
console.log('');

// Start type-checker if requested
let typeCheckerProc;
if (withTypeCheck) {
  typeCheckerProc = startTypeChecker(baseDir);
  console.log('');
}

doctypes.forEach(dt => buildDoctype(dt, isWatch));

if (isWatch) {
  console.log('\nWatching for changes... (Press Ctrl+C to stop)');
  // Handle Ctrl+C to clean up temp files
  process.on('SIGINT', () => {
    console.log('\nCleaning up...');
    doctypes.forEach(dt => {
      const tempEntry = path.join(dt.tsPath, '__bundle_entry__.ts');
      if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
    });
    if (typeCheckerProc) {
      typeCheckerProc.kill();
    }
    process.exit(0);
  });
}