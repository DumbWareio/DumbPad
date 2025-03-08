/**
 * Generate PWA icons from SVG file
 * This script uses the sharp library to generate various sizes of PNG icons
 * from the SVG file for PWA usage.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Define the sizes we need
const sizes = [
  192,  // Standard PWA icon
  512,  // Large PWA icon
  152,  // iPad
  167,  // iPad Pro
  180   // iPhone
];

const sourceFile = path.join(__dirname, '../public/Assets/dumbpad.svg');
const outputDir = path.join(__dirname, '../public/Assets/icons');

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate all icon sizes
async function generateIcons() {
  for (const size of sizes) {
    try {
      await sharp(sourceFile)
        .resize(size, size)
        .png()
        .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
      
      console.log(`✅ Generated icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Error generating icon-${size}x${size}.png:`, error);
    }
  }
}

// Run the generator
generateIcons()
  .then(() => console.log('Icon generation complete!'))
  .catch(err => console.error('Error generating icons:', err)); 