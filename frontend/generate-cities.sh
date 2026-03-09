#!/bin/bash
cities=(
  "kirkland" "bellevue" "redmond" "bothell" "woodinville"
  "kenmore" "shoreline" "mountlake-terrace" "edmonds" "lynnwood"
  "mill-creek" "mukilteo" "everett" "marysville" "monroe"
  "snohomish" "renton" "kent" "auburn" "federal-way"
  "des-moines" "burien" "tukwila" "seatac" "mercer-island"
  "bellevue-east" "issaquah" "sammamish" "maple-valley" "covington"
)

for city in "${cities[@]}"; do
  display=$(echo "$city" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
  mkdir -p "seattle/$city"
  cat > "seattle/$city/index.html" << HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Emergency Dentist in $display, WA — Moxident</title>
  <meta name="description" content="Need an emergency dentist in $display? Moxident matches you with a local dentist who can see you today. No insurance required."/>
  <meta http-equiv="refresh" content="0;url=https://moxident.com/?city=$city"/>
  <link rel="canonical" href="https://moxident.com/seattle/$city/"/>
</head>
<body>
  <script>window.location.href = 'https://moxident.com/?city=$city';</script>
  <p>Finding you an emergency dentist in $display... <a href="https://moxident.com">Click here if not redirected</a></p>
</body>
</html>
HTML
done
echo "Done — $(ls seattle | wc -l) city folders created"
