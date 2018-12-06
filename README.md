# node-fs-slice

slice file or join files or avg slice file.idea from [slice-file](https://github.com/substack/slice-file).

safely create multiple ReadStream or WriteStream objects from the same file descriptor. from [node-fd-slicer](https://github.com/andrewrk/node-fd-slicer).

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Build Status](https://api.travis-ci.org/SunilWang/node-fs-slice.svg?branch=master)](https://travis-ci.org/SunilWang/node-fs-slice)
[![NPM Version][npm-image]][npm-url]

# install

With [npm](https://www.npmjs.com/package/fs-slice) do:

```
npm install fs-slice --save
```

## Features

- ✔︎ Promise、async、await

# methods

``` js
var fss = require('fs-slice');
```

## var fssObj = fss(targetFile, opts={})

Create a fs-slice instance `fssObj` from a `filename` and some options `opts`.

* `targetFile` - String | Buffer. target file.
* `opts.blockSize` - Number. set how much data to read in each chunk. Default 204800.
* `opts.destPath` - String. make sure that it is a folder path. Default `os.tmpdir();`.

## var stream = fssObj.slice(opts={})

Return a readable stream that emits

Available `opts`:

 * `start` - Number. The offset into the file to start reading from. Defaults 0.
 * `end` - Number. Exclusive upper bound offset into the file to stop reading
   from. Defaults 204800.
 
 `opts` is an object or string with the following defaults:
 
 ```
{
  flags: 'r',
  encoding: null,
  fd: fssObj.fd,
  mode: 0o666,
  autoClose: true
}
 ```
 to see [fs.createReadStream](https://nodejs.org/dist/latest-v6.x/docs/api/fs.html#fs_fs_createreadstream_path_options)

## fssObj.sliceAsFile(filepath, rOptions={}, wOptions={}).then(function(){});

 * `filepath` - String. Make sure `filepath` is a file path.
 * `rOptions` - Object. read stream options.  `wOptions` - Object. write stream options.
    
`rOptions wOptions` is an object or string with the following defaults:

```
rOptions:
{
  start: 0,
  end: 204800,
  flags: 'r',
  encoding: null,
  fd: fssObj.fd,
  mode: 0o666,
  autoClose: true
}

wOptions:
{
  flags: 'w',
  defaultEncoding: 'utf8',
  fd: fs.openSync(filepath, 'w'),
  mode: 0o666,
  autoClose: true
}
```
to see [fs.createReadStream](https://nodejs.org/dist/latest-v6.x/docs/api/fs.html#fs_fs_createreadstream_path_options) [fs.createWriteStream](https://nodejs.org/dist/latest-v6.x/docs/api/fs.html#fs_fs_createwritestream_path_options)

## fssObj.avgSliceAsFile(opts={}).then(function(files){});

Available `opts`:

  * `index` - Number. block start index. Default 1.

## fssObj.join(filenameArray, writable).then(function(){});

  * `filenameArray` - Array[String]. multiple file fragments path, make sure `filenameArray` is a Array.
  * `writable` - WriteStream. make sure `writable` is a write stream.
  
## fssObj.joinAsFile(filenameArray, filepath).then(function(){});

  * `filenameArray` - Array[String]. multiple file fragments path.
  * `filepath` - WriteStream. Make sure `filepath` is a file path.

# example

## slice

slice file, return read stream

```js
var fss = require('fs-slice');
var fsText = fss('./test/data/text');

fsText.slice({start: 0, end: 20}).pipe(process.stdout);
```

```
A
A's
AA's
AB's
ABM'
```

## sliceAsFile

slice file, generate new file

```js
var fss = require('fs-slice');
var fs = require('fs');

var IMAGE_FILENAME = './test/data/image.jpg';
var fsImage = fss(IMAGE_FILENAME);

fsImage
    .sliceAsFile('./new_image.jpg', {start: 0, end: 204800})
    .then(function () {
        console.info('image: ', fs.statSync(IMAGE_FILENAME));
        console.info('new_image: ',fs.statSync('./new_image.jpg'));
        
        fs.unlinkSync('./new_image.jpg');
    })
    .catch(function (err) {
        console.error(err);
    });
```

```
image:  
{ 
  dev: 16777220,
  mode: 33188,
  nlink: 1,
  uid: 501,
  gid: 20,
  rdev: 0,
  blksize: 4096,
  ino: 29591490,
  size: 516943,
  blocks: 1016,
  atime: 2017-05-16T08:38:04.000Z,
  mtime: 2017-05-12T08:18:13.000Z,
  ctime: 2017-05-15T08:12:43.000Z,
  birthtime: 2017-05-12T08:18:13.000Z 
}


new_image:  
{ dev: 16777220,
  mode: 33188,
  nlink: 1,
  uid: 501,
  gid: 20,
  rdev: 0,
  blksize: 4096,
  ino: 29878556,
  size: 204800, //200kb
  blocks: 400,
  atime: 2017-05-16T08:37:13.000Z,
  mtime: 2017-05-16T08:38:04.000Z,
  ctime: 2017-05-16T08:38:04.000Z,
  birthtime: 2017-05-16T08:37:13.000Z 
}
```

## avgSliceAsFile

average slice file, generate multiple file fragments

```js
var fss = require('fs-slice');
var fs = require('fs');

var IMAGE_FILENAME = './test/data/image.jpg';
var fsImage = fss(IMAGE_FILENAME);

fsImage
    //blockSize default : 204800 byte (200kb)
    .avgSliceAsFile()
    .then(function (files) {
        console.info('##############', IMAGE_FILENAME, 'size: ', fs.statSync(IMAGE_FILENAME).size);
        console.info('############## files: \n', files);
        console.info('##############');
        for(let file of files){
            console.info(file, 'size: ',fs.statSync(file).size);

            fs.unlinkSync(file);
        }
    })
    .catch(function (err) {
        console.error(err);
    });
```

```
############## ./test/data/image.jpg size:  516943
############## files: 
 [ '/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/a7ed4d23c8d3ddf3761db74823196a54_1_image.jpg',
  '/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/260d0a57d94d31aea6e3892b239e1a5a_2_image.jpg',
  '/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/f47c7e739b6aa75df173751c9788d746_3_image.jpg',
############## files size: 
/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/a7ed4d23c8d3ddf3761db74823196a54_1_image.jpg size:  204800
/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/260d0a57d94d31aea6e3892b239e1a5a_2_image.jpg size:  204800
/var/folders/02/g9c5v3jn3fv7q1zbnxhf7n280000gn/T/f47c7e739b6aa75df173751c9788d746_3_image.jpg size:  107343

```

## join

multiple file fragments, join into write stream

```js
var fss = require('fs-slice');
var fs = require('fs');

var IMAGE_FILENAME = './test/data/image.jpg';
var fsImage = fss(IMAGE_FILENAME);
var tmpFiles = null;

fsImage
    .avgSliceAsFile({destPath: './test/temp/'})
    .then(function (files) {
        tmpFiles = files;

        var writable = fs.createWriteStream('./new_image.jpg');

        return fsImage.join(files, writable);
    })
    .then(function () {
        for(let file of tmpFiles){
            console.info(file, 'size: ',fs.statSync(file).size);
            fs.unlinkSync(file);
        }

        console.info('./new_image.jpg', 'size: ',fs.statSync('./new_image.jpg').size);
        fs.unlinkSync('./new_image.jpg');
     })
    .catch(function (err) {
        console.error(err);
    });
```

```
test/temp/5529a793a61c5867ae0da4831e41a024_1_image.jpg size:  204800
test/temp/9bd357ca82355b1919f9dd6a7633a26e_2_image.jpg size:  204800
test/temp/48f548b841d3ceeab7a6887984b1fdf3_3_image.jpg size:  107343

./new_image.jpg size:  516943
```

## joinAsFile

multiple file fragments, join into one file

```js
var fss = require('fs-slice');
var fs = require('fs');

var TEXT_FILENAME = './test/data/text';
var fsText = fss(TEXT_FILENAME);

fsText
    .sliceAsFile('./text1',{start: 0, end: 10})
    .then(function () {
        return fsText.sliceAsFile('./text2',{start: 10, end: 20});
    })
    .then(function () {
        return fsText.joinAsFile(['./text1', './text2'], './new_text');
    })
    .then(function (files) {
        console.info('############## file content');
        console.info('text1: ', JSON.stringify(fs.readFileSync('./text1', 'utf-8')));
        console.info('text2: ', JSON.stringify(fs.readFileSync('./text2', 'utf-8')));
        console.info('############## files size');
        console.info('./text1', 'size: ',fs.statSync('./text1').size);
        console.info('./text2', 'size: ',fs.statSync('./text2').size);
        console.info('');
        console.info('');
        console.info('############## new file content');
        console.info('./new_text: ', JSON.stringify(fs.readFileSync('./new_text', 'utf-8')));
        console.info('############## new file size');
        console.info('./new_text', 'size: ',fs.statSync('./new_text').size);


        fs.unlinkSync('./text1');
        fs.unlinkSync('./text2');
        fs.unlinkSync('./new_text');
    })
    .catch(function (err) {
        console.error(err);
    });
```

```
############## file content
text1:  "A\nA's\nAA's"
text2:  "\nAB's\nABM'"
############## files size
./text1 size:  10
./text2 size:  10


############## new file content
./new_text:  "A\nA's\nAA's\nAB's\nABM'"
############## new file size
./new_text size:  20

```

# license

MIT

[npm-image]: https://img.shields.io/npm/v/fs-slice.svg
[npm-url]: https://www.npmjs.com/package/fs-slice
