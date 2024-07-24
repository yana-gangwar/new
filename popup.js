
document.addEventListener('DOMContentLoaded', function() {

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var currentTab = tabs[0];
        var actionButton = document.getElementById('actionButton');
        var downloadCsvButton = document.getElementById('downloadCsvButton');
        var resultsTable = document.getElementById('resultsTable');
        var filenameInput = document.getElementById('filenameInput');
        var resultsInput = document.getElementById('resultsInput');
        if (currentTab && currentTab.url.includes("://www.google.com/maps/search")) {
            document.getElementById('message').textContent = "Let's scrape Google Maps!";
            actionButton.disabled = false;
            actionButton.classList.add('enabled');
        } else {
            var messageElement = document.getElementById('message');
            messageElement.innerHTML = '';
            var linkElement = document.createElement('a');
            linkElement.href = 'https://www.google.com/maps/search/';
            linkElement.textContent = "Go to Google Maps Search.";
            linkElement.target = '_blank'; 
            messageElement.appendChild(linkElement);

            actionButton.style.display = 'none'; 
            downloadCsvButton.style.display = 'none';
            filenameInput.style.display = 'none'; 
        }

        actionButton.addEventListener('click', function() {
            document.getElementById('loader').style.display = 'block';
            var numberOfResults = parseInt(resultsInput.value, 10) || 7;
            console.log("Number of results requested:", numberOfResults);
            chrome.scripting.executeScript({
                target: {tabId: currentTab.id},
                function: scrapeDataWithScroll,
                args: [numberOfResults] 
            }, function(results) {
                document.getElementById('loader').style.display = 'none';
                while (resultsTable.firstChild) {
                    resultsTable.removeChild(resultsTable.firstChild);
                }

                // Define and add headers to the table
                const headers = ['Title', 'Rating', 'Reviews', 'Phone', 'Industry', 'Address', 'Website', 'Google Maps Link'];
                const headerRow = document.createElement('tr');
                console.log("resultsInput");
                headers.forEach(headerText => {
                    const header = document.createElement('th');
                    header.textContent = headerText;
                    headerRow.appendChild(header);
                });
                resultsTable.appendChild(headerRow);

                // Add new results to the table
                if (!results || !results[0] || !results[0].result) return;
                results[0].result.forEach(function(item) {
                    var row = document.createElement('tr');
                    ['title', 'rating', 'reviewCount', 'phone', 'industry', 'address', 'companyUrl', 'href'].forEach(function(key) {
                        var cell = document.createElement('td');
                        
                        if (key === 'reviewCount' && item[key]) {
                            item[key] = item[key].replace(/\(|\)/g, ''); 
                        }
                        
                        cell.textContent = item[key] || ''; 
                        row.appendChild(cell);
                    });
                    resultsTable.appendChild(row);
                });

                if (results && results[0] && results[0].result && results[0].result.length > 0) {
                    downloadCsvButton.disabled = false;
                }
            });
        });

        downloadCsvButton.addEventListener('click', function() {
            var csv = tableToCsv(resultsTable); 
            var filename = filenameInput.value.trim();
            if (!filename) {
                filename = 'google-maps-data.csv'; 
            } else {
                filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.csv';
            }
            downloadCsv(csv, filename); 
        });
    });
});

function scrapeDataWithScroll(numberOfResults) {
    return new Promise((resolve, reject) => {
        let allResults = [];
        let previousResultsCount = 0;
        let noNewResultsCount = 0;
        let fetched_result = 0;
        const maxNoNewResults = 3; // Number of consecutive scrolls with no new results before stopping

        function scrapeVisibleResults() {
            let links = Array.from(document.querySelectorAll('a[href^="https://www.google.com/maps/place"]'));
            let newResults = links.map(link => {
                var container = link.closest('[jsaction*="mouseover:pane"]');
                var titleText = container ? container.querySelector('.fontHeadlineSmall')?.textContent.trim() : '';
                var rating = '';
                var reviewCount = '';
                var phone = '';
                var industry = '';
                var address = '';
                var companyUrl = '';
                
                // Rating and Reviews
                if (container) {
                    var roleImgContainer = container.querySelector('[role="img"]');
                    
                    if (roleImgContainer) {
                        var ariaLabel = roleImgContainer.getAttribute('aria-label');
                    
                        if (ariaLabel && ariaLabel.includes("stars")) {
                            var parts = ariaLabel.split(' ');
                            rating = parts[0];
                            reviewCount = '(' + parts[2] + ')'; 
                        } else {
                            rating = '0';
                            reviewCount = '0';
                        }
                    }
                }

                // Address and Industry
                if (container) {
                    var containerText = container.textContent || '';
                    var addressRegex = /\d+ [\w\s]+(?:#\s*\d+|Suite\s*\d+|Apt\s*\d+)?/;
                    var addressMatch = containerText.match(addressRegex);

                    if (addressMatch) {
                        address = addressMatch[0];

                        // Extract industry text based on the position before the address
                        var textBeforeAddress = containerText.substring(0, containerText.indexOf(address)).trim();
                        var ratingIndex = textBeforeAddress.lastIndexOf(rating + reviewCount);
                        if (ratingIndex !== -1) {
                            // Assuming industry is the first significant text after rating and review count
                            var rawIndustryText = textBeforeAddress.substring(ratingIndex + (rating + reviewCount).length).trim().split(/[\r\n]+/)[0];
                            industry = rawIndustryText.replace(/[·.,#!?]/g, '').trim();
                        }
                        var filterRegex = /\b(Closed|Open 24 hours|24 hours)|Open\b/g;
                        address = address.replace(filterRegex, '').trim();
                        address = address.replace(/(\d+)(Open)/g, '$1').trim();
                        address = address.replace(/(\w)(Open)/g, '$1').trim();
                        address = address.replace(/(\w)(Closed)/g, '$1').trim();
                    } else {
                        address = '';
                    }
                }

                // Company URL
                if (container) {
                    var allLinks = Array.from(container.querySelectorAll('a[href]'));
                    var filteredLinks = allLinks.filter(a => !a.href.startsWith("https://www.google.com/maps/place/"));
                    if (filteredLinks.length > 0) {
                        companyUrl = filteredLinks[0].href;
                    }
                }

                // Phone Numbers
                if (container) {
                    var containerText = container.textContent || '';
                    var phoneRegex = /(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
                    var phoneMatch = containerText.match(phoneRegex);
                    phone = phoneMatch ? phoneMatch[0] : '';
                }
                
                return {
                    title: titleText,
                    rating: rating,
                    reviewCount: reviewCount,
                    phone: phone,
                    industry: industry,
                    address: address,
                    companyUrl: companyUrl,
                    href: link.href,
                };
            });

            // Filter out duplicates
            newResults = newResults.filter(newResult => 
                !allResults.some(existingResult => existingResult.href === newResult.href)
            );

            allResults = allResults.concat(newResults);
            return allResults.length;
        }
        function email_scratcher(company_url){
            var company_email=[]
            console.log("company_url",company_url);
            for (let index = 0; index < company_url.length; index++) {
                const apiKey = 'Y2E5OWYzNmU1NDljNDhkMWJlN2IxNDA2MDFlMWViZjB8ZTYzYjBiODBkOQ';
                const query = company_url[index];
                console.log(query)
                const url = `https://api.app.outscraper.com/emails-and-contacts?query=${encodeURIComponent(query)}&async=false`;
                fetch(url, {
                 method: 'GET',
                 headers: {
                    'X-API-KEY': apiKey
                 }
                })
                // .then(response => {
                //  if (!response.ok) {
                //     throw new Error(`HTTP error! status: ${response.status}`);
                //  }
                //  return response.json();
                // })
                .then(data => {
                 company_email.push("HII");
                })
                .catch(error => {
                 console.error('There was a problem with the fetch operation:', error);
                });
            }
            console.log(company_email);
        }
        function scrollAndScrape() {
            let currentResultsCount = scrapeVisibleResults();
            console.log(`Current results: ${currentResultsCount}, Previous: ${previousResultsCount}`);
            console.log("fetched_result",currentResultsCount);

            if(currentResultsCount>=numberOfResults){
                console.log("RESULT",allResults.slice(0,numberOfResults));
                var company_url=[]
                for (let index = 0; index < allResults.slice(0,numberOfResults).length; index++) {
                    company_url.push(allResults.slice(0,numberOfResults)[index]['companyUrl']);
                }
                // email_scratcher(company_url);
                resolve(allResults.slice(0,numberOfResults));
            }
            else{
            if (currentResultsCount > previousResultsCount) {
                // New results found
                previousResultsCount = currentResultsCount;
                noNewResultsCount = 0;
                scrollToBottom();
                setTimeout(scrollAndScrape, 2000); // Wait for 2 seconds after scrolling
            } else {
                // No new results in this scroll
                noNewResultsCount++;
                if (noNewResultsCount >= maxNoNewResults) {
                    console.log('No new results after multiple scrolls. Ending scrape.');
                    resolve(allResults);
                } else {
                    console.log(`No new results. Attempt ${noNewResultsCount}/${maxNoNewResults}`);
                    scrollToBottom();
                    setTimeout(scrollAndScrape, 2000);
                }
            }
        }
        }

        function scrollToBottom() {
            console.log('Attempting to scroll');
            const selectors = [
                'div[role="feed"]',
                'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
                'div[aria-label="Results for"]',
                // Add more selectors if needed
            ];

            let scrollableElement = null;
            for (let selector of selectors) {
                scrollableElement = document.querySelector(selector);
                if (scrollableElement) {
                    console.log('Found scrollable element with selector:', selector);
                    break;
                }
            }

            if (scrollableElement) {
                const currentScrollTop = scrollableElement.scrollTop;
                const scrollHeight = scrollableElement.scrollHeight;
                scrollableElement.scrollTo({
                    top: scrollHeight,
                    behavior: 'smooth'
                });
                console.log(`Scrolled from ${currentScrollTop} to ${scrollHeight}`);
            } else {
                console.log('Scrollable element not found');
            }
        }

        scrollAndScrape();
    });
}

// Convert the table to a CSV string
function tableToCsv(table) {
    var csv = [];
    var rows = table.querySelectorAll('tr');
    
    for (var i = 0; i < rows.length; i++) {
        var row = [], cols = rows[i].querySelectorAll('td, th');
        
        for (var j = 0; j < cols.length; j++) {
            row.push('"' + cols[j].innerText + '"');
        }
        csv.push(row.join(','));
    }
    return csv.join('\n');
}

// Download the CSV file
function downloadCsv(csv, filename) {
    var csvFile;
    var downloadLink;

    csvFile = new Blob([csv], {type: 'text/csv'});
    downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
}