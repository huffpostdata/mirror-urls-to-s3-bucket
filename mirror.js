#!/usr/bin/env node
'use strict'

const debug = require('debug')('mirror')
const fs = require('fs')
const request = require('request')
const AWS = require('aws-sdk')

const base_url = process.argv[2]
const filename_of_paths = process.argv[3]
const s3_bucket_with_prefix = process.argv[4]

if (!s3_bucket_with_prefix) {
  process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} BASE_URL PATHS_FILE S3_BUCKET\n`)
  process.exit(1)
}

if (!/^s3:\/\//.test(s3_bucket_with_prefix)) {
  process.stderr.write(`Your S3 bucket name, ${s3_bucket_with_prefix}, doesn't start with "s3://". It must.\n`)
  process.exit(1)
}

const s3_bucket = s3_bucket_with_prefix.substring(5)

const s3 = new AWS.S3()
/**
 * Calls `callback` with an Array of { path, key } Objects.
 *
 * Calls `callback` with an Error if loading failed.
 */
function load_path_objects(filename, callback) {
  fs.readFile(filename, 'utf-8', (error, text) => {
    if (error) return callback(error)

    const lines = text.split(/\r?\n/)
      .filter(line => line[0] !== '#')

    // Ignore newlines at end of file
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

    // Nix leading "/" on each line
    for (const i in lines) lines[i] = lines[i].replace(/^\//, '')

    const objects = lines.map(line => {
      return {
        path: line,
        key: line == '' ? 'index' : line
      }
    })

    return callback(null, objects)
  })
}

/**
 * Uploads a [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
 * to S3 `key`.
 */
function upload_response(key, response, body, callback) {
  switch (response.statusCode) {
    case 200:
    case 204:
    case 301:
    case 302: // AWS will change this to a 301 :(
      const headers = response.headers

      const s3_params = {
        Bucket: s3_bucket,
        Key: key,
        ACL: 'public-read',
        Body: body,
        ServerSideEncryption: 'AES256',
        CacheControl: headers['cache-control'],
        ContentDisposition: headers['content-disposition'],
        ContentType: headers['content-type'],
        ContentLanguage: headers['content-language'],
        ContentLength: headers['content-length'],
      }
      if (Math.floor(response.statusCode / 100) === 3) {
        s3_params.WebsiteRedirectLocation = headers['redirect']
      }

      debug(`PUT ${s3_bucket_with_prefix}/${key}`)
      s3.putObject(s3_params, callback)

      break
    case 500:
      debug(`PUT 500 ${s3_bucket_with_prefix}/${key}`)

      s3.putObject({
        Bucket: s3_bucket,
        Key: key,
        ACL: 'public-read',
        Body: 'For years, this page produced error messages. Now it produces these two sentences.',
        ServerSideEncryption: 'AES256',
        CacheControl: 'public; max-age=3600',
        ContentType: 'text/plain; charset=utf-8'
      }, callback)

      break
    case 401:
      debug(`PUT 401 /${key}`)
      s3.putObject({
        Bucket: s3_bucket,
        Key: key,
        ACL: 'public-read',
        Body: 'Access denied (there is no more content here)',
        ServerSideEncryption: 'AES256',
        CacheControl: 'public; max-age=3600',
        ContentType: 'text/plain; charset=utf-8'
      }, callback)

      break
    case 404:
      if (key.indexOf("404") !== -1) { //intentional
        const headers = response.headers

        const s3_params = {
          Bucket: s3_bucket,
          Key: key,
          ACL: 'public-read',
          Body: body,
          ServerSideEncryption: 'AES256',
          CacheControl: headers['cache-control'],
          ContentDisposition: headers['content-disposition'],
          ContentType: headers['content-type'],
          ContentLanguage: headers['content-language'],
          ContentLength: headers['content-length'],
        }
        debug(`PUT ${s3_bucket_with_prefix}/${key}`)
        s3.putObject(s3_params, callback)
      } else {
        debug(`SKIP 404 /${key}`)
        callback(null)
      }
      break
    default:
      callback(new Error(`Got status code ${response.statusCode}`))
  }
}

function upload_path_object(path_object, callback) {
  const url = `${base_url}/${path_object.path}`
  const key = path_object.key

  debug(`GET ${url}`)
  request.get(url, { followRedirect: false, encoding: null }, (error, response, body) => {
    if (error) return callback(error)

    upload_response(key, response, body, callback)
  })
}

function upload_path_objects(path_objects, callback) {
  const todo = path_objects.slice()

  function step() {
    if (todo.length === 0) {
      callback(null)
    } else {
      upload_path_object(todo.shift(), (error) => {
        if (error) {
          callback(error)
        } else {
          process.nextTick(step)
        }
      })
    }
  }

  step()
}

function main() {
  load_path_objects(filename_of_paths, (error, path_objects) => {
    if (error) throw error

    upload_path_objects(path_objects, (error) => {
      if (error) throw error
      debug('All done!')
    })
  })
}

main()
