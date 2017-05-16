import test from 'ava';
import fs from 'fs';
import Fss from '../';

const IMAGE_FILENAME = './test/data/image.jpg';
const TEXT_FILENAME = './test/data/text';
let fsImage = null;
let fsText = null;

test.before(() => {
    fsImage = new Fss(IMAGE_FILENAME, {blockSize: 204800, destPath: __dirname + '/temp'});
    fsText = new Fss(TEXT_FILENAME, {blockSize: 204800, destPath: __dirname + '/temp'});
});

test('should slice success', function * (t) {
    let readable = yield fsImage.slice();
    let tempFilename = './test/temp/slice_temp.jpg';

    return new Promise(function(resolve, reject) {
        let writable = fs.createWriteStream(tempFilename);

        readable.on('end', () => {
            return resolve();
        });

        readable.on('error', (err) => {
            return reject(err);
        });

        readable.pipe(writable);
    }).then(function () {
        t.is(fs.statSync(tempFilename).size, 204800);
        fs.unlinkSync(tempFilename);
    });
});

test('should sliceAsFile success', function * (t) {
    let tempFilename = './test/temp/sliceAsFile_temp.jpg';

    yield fsImage.sliceAsFile(tempFilename, {start: 0, end: 500000});

    t.is(fs.statSync(tempFilename).size, 500000);
    fs.unlinkSync(tempFilename);
});

test('should sliceAsFile by text success', function * (t) {
    let tempFilename = './test/temp/sliceAsFile_text_temp';

    yield fsText.sliceAsFile(tempFilename, {start: 0, end: 10});
    let data = fs.readFileSync(tempFilename, 'utf-8');

    t.is(data, "A\nA's\nAA's");
    t.is(fs.statSync(tempFilename).size, 10);

    fs.unlinkSync(tempFilename);
});

test('should sliceAsFile default interval success', function * (t) {
    let tempFilename = './test/temp/sliceAsFile_default_interval_temp.jpg';

    yield fsImage.sliceAsFile(tempFilename);

    t.is(fs.statSync(tempFilename).size, 204800);

    fs.unlinkSync(tempFilename);
});

test('should avgSliceAsFile default interval success', function * (t) {
    let tempFilename = './test/temp/avgSliceAsFile_default_interval_temp.jpg';
    let res = yield fsImage.avgSliceAsFile(tempFilename);

    t.is(fs.statSync(res[0]).size, 204800);
    t.is(fs.statSync(res[1]).size, 204800);
    t.is(fs.statSync(res[2]).size, 107343);

    for(let file of res){
        fs.unlinkSync(file);
    }
});

test('should avgSliceAsFile success', function * (t) {
    let res = yield fsImage.avgSliceAsFile({blockSize: 104800});

    t.is(res.length, 5);
    t.is(fs.statSync(res[0]).size, 104800);
    t.is(fs.statSync(res[1]).size, 104800);
    t.is(fs.statSync(res[2]).size, 104800);
    t.is(fs.statSync(res[3]).size, 104800);
    t.is(fs.statSync(res[4]).size, 97743);

    for(let file of res){
        fs.unlinkSync(file);
    }
});

test('should join success', function * (t) {
    let tempFilename = './test/temp/join_temp';
    let res = yield fsText.avgSliceAsFile();
    let writable = fs.createWriteStream(tempFilename);

    yield fsText.join(res, writable);

    t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size);

    let textData = fs.readFileSync(TEXT_FILENAME, 'utf-8');
    let tempData = fs.readFileSync(tempFilename, 'utf-8');

    t.is(textData, tempData);

    fs.unlinkSync(tempFilename);

    for(let file of res){
        fs.unlinkSync(file);
    }
});

test('should joinAsFile success', function * (t) {
    let tempFilename = './test/temp/joinAsFile_temp';
    let res = yield fsText.avgSliceAsFile();

    yield fsText.joinAsFile(res, tempFilename);

    t.is(fs.statSync(TEXT_FILENAME).size, fs.statSync(tempFilename).size);

    let textData = fs.readFileSync(TEXT_FILENAME, 'utf-8');
    let tempData = fs.readFileSync(tempFilename, 'utf-8');

    t.is(textData, tempData);

    fs.unlinkSync(tempFilename);

    for(let file of res){
        fs.unlinkSync(file);
    }
});