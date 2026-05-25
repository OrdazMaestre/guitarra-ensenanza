/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = process.argv[2];
const outputDir = process.argv[3];

if (!sourcePath || !outputDir) {
  console.error('Usage: node scripts/extract-sf2-samples.cjs <input.sf2> <output-dir>');
  process.exit(1);
}

function fourCC(buffer, offset) {
  return buffer.toString('ascii', offset, offset + 4);
}

function findTopLevelList(buffer, listType) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = fourCC(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'LIST' && fourCC(buffer, offset + 8) === listType) {
      return { end: offset + 8 + size, start: offset + 12 };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

function findChunkInList(buffer, list, chunkId) {
  let offset = list.start;
  while (offset + 8 <= list.end) {
    const id = fourCC(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === chunkId) {
      return { end: offset + 8 + size, size, start: offset + 8 };
    }
    if (id === 'LIST') {
      const nested = { end: offset + 8 + size, start: offset + 12 };
      const found = findChunkInList(buffer, nested, chunkId);
      if (found) return found;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

function readNullTerminatedName(buffer, offset, length) {
  const raw = buffer.subarray(offset, offset + length);
  const nullIndex = raw.indexOf(0);
  return raw.subarray(0, nullIndex === -1 ? raw.length : nullIndex).toString('ascii').trim();
}

function parseSampleHeaders(buffer, chunk) {
  const records = [];
  for (let offset = chunk.start; offset + 46 <= chunk.end; offset += 46) {
    const name = readNullTerminatedName(buffer, offset, 20);
    if (!name || name === 'EOS') continue;
    records.push({
      end: buffer.readUInt32LE(offset + 24),
      endLoop: buffer.readUInt32LE(offset + 32),
      name,
      originalPitch: buffer.readUInt8(offset + 40),
      pitchCorrection: buffer.readInt8(offset + 41),
      sampleRate: buffer.readUInt32LE(offset + 36),
      sampleType: buffer.readUInt16LE(offset + 44),
      start: buffer.readUInt32LE(offset + 20),
      startLoop: buffer.readUInt32LE(offset + 28),
    });
  }
  return records.filter((record) => (record.sampleType & 0x8000) === 0);
}

function parseBags(buffer, chunk) {
  const records = [];
  for (let offset = chunk.start; offset + 4 <= chunk.end; offset += 4) {
    records.push({
      genIndex: buffer.readUInt16LE(offset),
      modIndex: buffer.readUInt16LE(offset + 2),
    });
  }
  return records;
}

function parseGenerators(buffer, chunk) {
  const records = [];
  for (let offset = chunk.start; offset + 4 <= chunk.end; offset += 4) {
    records.push({
      amount: buffer.readUInt16LE(offset + 2),
      id: buffer.readUInt16LE(offset),
    });
  }
  return records;
}

function parseInstruments(buffer, chunk) {
  const records = [];
  for (let offset = chunk.start; offset + 22 <= chunk.end; offset += 22) {
    const name = readNullTerminatedName(buffer, offset, 20);
    if (!name || name === 'EOI') continue;
    records.push({
      bagIndex: buffer.readUInt16LE(offset + 20),
      name,
    });
  }
  return records;
}

function generatorRange(amount) {
  return { high: (amount >> 8) & 0xff, low: amount & 0xff };
}

function parseInstrumentSampleZones(buffer, pdta) {
  const instChunk = findChunkInList(buffer, pdta, 'inst');
  const ibagChunk = findChunkInList(buffer, pdta, 'ibag');
  const igenChunk = findChunkInList(buffer, pdta, 'igen');
  if (!instChunk || !ibagChunk || !igenChunk) return new Map();

  const instruments = parseInstruments(buffer, instChunk);
  const bags = parseBags(buffer, ibagChunk);
  const generators = parseGenerators(buffer, igenChunk);
  const sampleZones = new Map();

  for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
    const instrument = instruments[instrumentIndex];
    const nextInstrument = instruments[instrumentIndex + 1];
    const bagEnd = nextInstrument?.bagIndex ?? bags.length - 1;

    for (let bagIndex = instrument.bagIndex; bagIndex < bagEnd; bagIndex++) {
      const bag = bags[bagIndex];
      const nextBag = bags[bagIndex + 1];
      if (!bag || !nextBag) continue;

      const zone = {
        keyRange: null,
        overridingRootKey: null,
        sampleID: null,
      };

      for (let genIndex = bag.genIndex; genIndex < nextBag.genIndex; genIndex++) {
        const generator = generators[genIndex];
        if (!generator) continue;
        if (generator.id === 43) zone.keyRange = generatorRange(generator.amount);
        if (generator.id === 53) zone.sampleID = generator.amount;
        if (generator.id === 58) zone.overridingRootKey = generator.amount;
      }

      if (zone.sampleID !== null) {
        sampleZones.set(zone.sampleID, zone);
      }
    }
  }

  return sampleZones;
}

function writeWav(filePath, pcmData, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, pcmData]));
}

const sf2 = fs.readFileSync(sourcePath);
if (fourCC(sf2, 0) !== 'RIFF' || fourCC(sf2, 8) !== 'sfbk') {
  throw new Error(`${sourcePath} is not an SF2 RIFF/sfbk file`);
}

const sdta = findTopLevelList(sf2, 'sdta');
const pdta = findTopLevelList(sf2, 'pdta');
const smpl = sdta && findChunkInList(sf2, sdta, 'smpl');
const shdr = pdta && findChunkInList(sf2, pdta, 'shdr');

if (!smpl || !shdr) {
  throw new Error('Missing smpl or shdr chunk in SF2');
}

fs.mkdirSync(outputDir, { recursive: true });

const sampleZones = parseInstrumentSampleZones(sf2, pdta);

const manifest = parseSampleHeaders(sf2, shdr)
  .map((sample, index) => {
    const startByte = smpl.start + sample.start * 2;
    const endByte = smpl.start + sample.end * 2;
    const pcmData = sf2.subarray(startByte, endByte);
    if (pcmData.length <= 0 || sample.originalPitch <= 0) return null;

    const slug = `${String(index + 1).padStart(2, '0')}-${sample.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const fileName = `${slug}.wav`;
    writeWav(path.join(outputDir, fileName), pcmData, sample.sampleRate);
    const zone = sampleZones.get(index);
    const rootKey = zone?.overridingRootKey ?? sample.originalPitch;
    const keyRange = zone?.keyRange ?? { high: 127, low: 0 };

    return {
      duration: pcmData.length / 2 / sample.sampleRate,
      file: fileName,
      keyRange,
      loopEnd: Math.max(0, sample.endLoop - sample.start),
      loopStart: Math.max(0, sample.startLoop - sample.start),
      name: sample.name,
      pitchCorrection: sample.pitchCorrection,
      rootKey,
      sampleRate: sample.sampleRate,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.rootKey - b.rootKey);

fs.writeFileSync(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(
    {
      license: 'public domain',
      name: 'Seagull Acoustic Guitar',
      source: 'https://www.rkhive.com/guitar.html',
      samples: manifest,
    },
    null,
    2
  )}\n`
);

console.log(`Extracted ${manifest.length} samples to ${outputDir}`);
