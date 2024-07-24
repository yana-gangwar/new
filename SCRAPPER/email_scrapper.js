const axios = require('axios');
const { parseString } = require('xml2js');
const xml2js = require('xml2js');
const { URL } = require('url');

async function getSitemap(url) {
    // Ensure the URL has a scheme
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }

    const baseUrl = new URL(url);

    // List of common sitemap paths
    const sitemapPaths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap.php',
        '/sitemap.txt'
    ];

    // Try common sitemap locations
    for (const path of sitemapPaths) {
        const sitemapUrl = new URL(path, baseUrl).toString();
        try {
            const response = await axios.get(sitemapUrl);
            if (response.status === 200) {
                return { url: sitemapUrl, content: response.data };
            }
        } catch (error) {
            // Continue to next path if error occurs
        }
    }

    // Check robots.txt for sitemap
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    try {
        const response = await axios.get(robotsUrl);
        if (response.status === 200) {
            const lines = response.data.split('\n');
            for (const line of lines) {
                if (line.toLowerCase().startsWith('sitemap:')) {
                    const sitemapUrl = line.split(': ')[1].trim();
                    try {
                        const sitemapResponse = await axios.get(sitemapUrl);
                        if (sitemapResponse.status === 200) {
                            return { url: sitemapUrl, content: sitemapResponse.data };
                        }
                    } catch (error) {
                        // Continue if error occurs
                        console.log(error);
                    }
                }
            }
        }
    } catch (error) {
        // Continue if error occurs
        console.log(error);
    }

    return null;
}

function parseSitemap(sitemapContent) {
    return new Promise((resolve, reject) => {
        parseString(sitemapContent, (err, result) => {
            if (err) {
                reject(err);
            } else {
                let urls = [];
                if (result.urlset && result.urlset.url) {
                    urls = result.urlset.url.map(urlObj => urlObj.loc[0]);
                } else if (result.sitemapindex && result.sitemapindex.sitemap) {
                    urls = result.sitemapindex.sitemap.map(sitemapObj => sitemapObj.loc[0]);
                }
                resolve(urls);
            }
        });
    });
}

async function extractURLsFromSitemap(url) {
    try {
      // Fetch the XML content of the sitemap
      const response = await axios.get(url);
      const xmlData = response.data;
  
      // Parse the XML
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);
  
      // Extract URLs from the parsed XML
      const urls = result.urlset.url.map(urlObj => urlObj.loc[0]);
  
      return urls;
    } catch (error) {
      console.error('Error fetching or parsing the sitemap:', error);
      return [];
    }
  }

async function main() {
    const websiteUrl = 'http://www.donboscoschool.in/'; 
    var sitemap_urls=[];
    try {
        const sitemap = await getSitemap(websiteUrl);
        if (sitemap) {
            sitemap_urls = await parseSitemap(sitemap.content);
            console.log(`Number of URLs in sitemap: ${sitemap_urls.length}`);
            console.log(sitemap_urls);
        } else {
            console.log("Sitemap not found.");
        }
    } catch (error) {
        console.error("An error occurred:", error);
    }
    var web_page_urls=[]
    for (let index = 0; index < sitemap_urls.length; index++) {
       console.log(sitemap_urls[index]);
        const result_urls= await extractURLsFromSitemap(sitemap_urls[index])
        result_urls.forEach(item => web_page_urls.push(item));
            console.log('Total URLs found:', result_urls.length);
    }
    web_page_urls = [...new Set(web_page_urls)];
    console.log(web_page_urls.length,web_page_urls);
}
main();