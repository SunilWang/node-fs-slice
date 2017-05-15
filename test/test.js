import test from 'ava';
import fs from 'fs';
import Fss from '../';

const FILENAME = './test/data/image.jpg';

test('should slice success', function * (t) {
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let readable = yield fsImage.slice();
    let tmpFilename = './test/data/tmp/slice_tmp.jpg';

    return new Promise(function(resolve, reject) {
        let writable = fs.createWriteStream(tmpFilename);

        readable.on('end', () => {
            return resolve();
        });

        readable.on('error', (err) => {
            return reject(err);
        });

        readable.pipe(writable);
    }).then(function () {
        t.is(fs.statSync(tmpFilename).size, 204800);
        fs.unlinkSync(tmpFilename);
    });
});

test('should sliceToFile success', function * (t) {
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let tmpFilename = './test/data/tmp/sliceToFile_tmp.jpg';

    yield fsImage.sliceToFile(tmpFilename, {start: 0, end: 500000});

    t.is(fs.statSync(tmpFilename).size, 500000);
    fs.unlinkSync(tmpFilename);
});

test('should sliceToFile default interval success', function * (t) {
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let tmpFilename = './test/data/tmp/sliceToFile_default_interval_tmp.jpg';

    yield fsImage.sliceToFile(tmpFilename);

    t.is(fs.statSync(tmpFilename).size, 204800);

    fs.unlinkSync(tmpFilename);
});

test('should avgSliceToFile default interval success', function * (t) {
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let tmpFilename = './test/data/tmp/avgSliceToFile_default_interval_tmp.jpg';
    let res = yield fsImage.avgSliceToFile(tmpFilename);

    t.is(fs.statSync(res[0]).size, 204800);
    t.is(fs.statSync(res[1]).size, 204800);
    t.is(fs.statSync(res[2]).size, 107343);

    for(let file of res){
        fs.unlinkSync(file);
    }
});

test('should avgSliceToFile success', function * (t) {
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let res = yield fsImage.avgSliceToFile({blockSize: 104800});

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
    let fsImage = new Fss(FILENAME, {blockSize: 204800, tmpPath: __dirname + '/data/tmp'});
    let tmpFilename = './test/data/tmp/join_tmp.jpg';
    let res = yield fsImage.avgSliceToFile();

    yield fsImage.join(res, tmpFilename);

    t.is(fs.statSync(FILENAME).size, fs.statSync(tmpFilename).size);

    fs.unlinkSync(tmpFilename);

    for(let file of res){
        fs.unlinkSync(file);
    }
});