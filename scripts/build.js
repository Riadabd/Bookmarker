const { mkdirSync, rmSync, existsSync, cpSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const rootDir = process.cwd();
const distDir = join(rootDir, 'dist');
const staticDir = join(rootDir, 'static');

function cleanDist() {
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }
  mkdirSync(distDir, { recursive: true });
}

function compileTs() {
  const result = spawnSync('npx', ['tsc', '--project', 'tsconfig.json'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyStatic() {
  cpSync(staticDir, distDir, { recursive: true });
}

function main() {
  cleanDist();
  copyStatic();
  compileTs();
}

main();
