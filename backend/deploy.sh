#!/bin/bash
set -e

rm -rf dist
rm -f moxident-lambda.zip

mkdir dist
cp -r src dist/
cp package.json package-lock.json dist/

cd dist
npm install --omit=dev --no-audit --no-fund --progress=false
zip -r ../moxident-lambda.zip . > /dev/null
cd ..

aws lambda update-function-code \
  --function-name moxident-router \
  --zip-file fileb://moxident-lambda.zip \
  --region us-east-2