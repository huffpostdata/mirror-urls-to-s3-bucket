Copies a site to S3, including headers.

# The problem

Your web server costs money, and it doesn't do much. It generates the same HTML
over and over again, and you have to pay to keep your server up.

You want to move all that to an [S3](https://aws.amazon.com/s3/) bucket, because
it's far cheaper and faster. And then you won't have to maintain your aging
web server.

## Your assets

* You have a web server
* You have a list of all paths for all URLs you want to serve
* You have an S3 bucket
* All your endpoints are `GET` endpoints

# Usage

Create `list-of-paths.txt`, a newline-separated list of URL paths. Each starts
with `/`.

```
npm install # install dependencies
# Add AWS credentials to your environment somehow
DEBUG=* node ./mirror.js \
  'http://example.com'   \
  'list-of-paths.txt'    \
  's3://example.com.s3.amazonaws.com'
```

If any line except the last line is empty, that'll mirror the _root_ path (e.g.,
`http://example.com`) and upload it as `index.html`.
