(function() {
    'use strict';
    
    // Sample contact data (will be empty initially)
    const contactData = [];

    // HubSpot companies data (will be populated from API)
    let hubspotCompanies = [];

    // Plugin configuration
    const pluginConfig = {
        name: 'HubSpotCompanySearchPlugin',
        version: '2.0.0',
        description: 'A company search plugin with HubSpot integration'
    };

    // HubSpot API configuration
    const hubspotConfig = {
        apiUrl: 'https://api.hubapi.com/crm/v3/objects/companies',
        proxyUrl: '', // Will be loaded from Nintex variable 'HubSpotBackendURL'
        accessToken: '', // Will be loaded from Nintex variable 'HubSpotAPIToken'
        isConfigured: false,
        corsOption: 'direct', // Will be loaded from Nintex variable 'HubSpotCORSOption' or auto-detected
        nintexVariableName: 'HubSpotAPIToken' // Default Nintex variable name for the token
    };

    // Nintex Integration Functions
    function getNintexVariable(variableName) {
        try {
            // Check if Nintex FormFiller is available
            if (typeof NWF !== 'undefined' && NWF.FormFiller && NWF.FormFiller.Functions) {
                // Get variable value from Nintex
                return NWF.FormFiller.Functions.GetVariableValue(variableName);
            } else if (typeof NWF !== 'undefined' && NWF.RuntimeFunctions) {
                // Alternative method for different Nintex versions
                return NWF.RuntimeFunctions.GetVariableValue(variableName);
            }
            return null;
        } catch (error) {
            console.warn(`Could not retrieve Nintex variable '${variableName}':`, error);
            return null;
        }
    }

    function setNintexVariable(variableName, value) {
        try {
            if (typeof NWF !== 'undefined' && NWF.FormFiller && NWF.FormFiller.Functions) {
                NWF.FormFiller.Functions.SetVariableValue(variableName, value);
                return true;
            } else if (typeof NWF !== 'undefined' && NWF.RuntimeFunctions) {
                NWF.RuntimeFunctions.SetVariableValue(variableName, value);
                return true;
            }
            return false;
        } catch (error) {
            console.warn(`Could not set Nintex variable '${variableName}':`, error);
            return false;
        }
    }

    function loadHubSpotTokenFromNintex() {
        const token = getNintexVariable(hubspotConfig.nintexVariableName);
        if (token) {
            hubspotConfig.accessToken = token;
            hubspotConfig.isConfigured = true;
            console.log('HubSpot token successfully loaded from Nintex variable');
            return true;
        }
        console.warn(`HubSpot token not found in Nintex variable: ${hubspotConfig.nintexVariableName}`);
        return false;
    }

    function loadConfigFromNintex() {
        // Load HubSpot token
        loadHubSpotTokenFromNintex();
        
        // Load backend server URL if available
        const backendUrl = getNintexVariable('HubSpotBackendURL');
        if (backendUrl) {
            hubspotConfig.proxyUrl = backendUrl;
            console.log('Backend server URL loaded from Nintex variable');
        }
        
        // Load CORS option if available (default to 'backend' if backend URL is provided, otherwise 'direct')
        const corsOption = getNintexVariable('HubSpotCORSOption');
        if (corsOption && (corsOption === 'backend' || corsOption === 'direct')) {
            hubspotConfig.corsOption = corsOption;
        } else {
            // Auto-detect based on backend URL availability
            hubspotConfig.corsOption = backendUrl ? 'backend' : 'direct';
        }
        
        console.log(`CORS handling method: ${hubspotConfig.corsOption}`);
    }

    // Initialize the plugin
    function initializePlugin() {
        createPluginHTML();
        bindEvents();
        // Try to load configuration from Nintex variables
        setTimeout(() => {
            loadConfigFromNintex();
        }, 100); // Small delay to ensure Nintex context is available
        // Table starts empty - will be populated when search is performed
    }

    // Create the HTML structure
    function createPluginHTML() {
        const container = document.createElement('div');
        container.className = 'nintex-contact-plugin';
        container.innerHTML = `
            <div class="plugin-container">
                <div class="header-section">
                    <button id="searchBtn" class="primary-button">
                        <span id="searchBtnText">Search HubSpot</span>
                        <span id="searchLoader" class="loader" style="display: none;"></span>
                    </button>
                    <div class="text-input-group">
                        <label for="companyNameInput">Company Name</label>
                        <input type="text" id="companyNameInput" class="text-input" placeholder="Enter company name to search" />
                    </div>
                </div>
                
                <div class="table-section">
                    <div class="table-header">
                        <h3 id="tableTitle">Companies</h3>
                        <div class="table-actions">
                            <button id="clearTableBtn" class="clear-btn">Clear Results</button>
                            <span id="resultCount" class="result-count">0 companies</span>
                        </div>
                    </div>
                    <table id="contactTable" class="contact-table">
                        <thead>
                            <tr>
                                <th>Company Name</th>
                                <th>Domain</th>
                                <th>Phone Number</th>
                                <th>City</th>
                                <th>Industry</th>
                            </tr>
                        </thead>
                        <tbody id="contactTableBody">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Add styles
        const styles = `
            <style>
                .nintex-contact-plugin {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 1200px;
                    margin: 20px auto;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                
                .plugin-container {
                    background: white;
                    border-radius: 8px;
                    padding: 24px;
                    border: 1px solid #e1e5e9;
                }
                
                .header-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid #e1e5e9;
                }
                
                .primary-button {
                    background: #007acc;
                    color: white;
                    border: 2px solid #007acc;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 140px;
                    justify-content: center;
                }
                
                .primary-button:hover {
                    background: #005a9e;
                    border-color: #005a9e;
                }
                
                .primary-button:disabled {
                    background: #6c757d;
                    border-color: #6c757d;
                    cursor: not-allowed;
                }
                
                .loader {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #ffffff;
                    border-top: 2px solid transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .text-input-group {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }
                
                .text-input-group label {
                    color: #6c757d;
                    font-size: 14px;
                    margin-bottom: 4px;
                    font-weight: 500;
                }
                
                .text-input {
                    padding: 8px 12px;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    font-size: 14px;
                    width: 250px;
                    transition: border-color 0.2s ease;
                }
                
                .text-input:focus {
                    outline: none;
                    border-color: #007acc;
                    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
                }
                
                .table-section {
                    margin-bottom: 24px;
                }
                
                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                
                .table-header h3 {
                    margin: 0;
                    color: #495057;
                    font-size: 18px;
                }
                
                .table-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .clear-btn {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .clear-btn:hover {
                    background: #c82333;
                }
                
                .result-count {
                    color: #6c757d;
                    font-size: 14px;
                    font-weight: 500;
                }
                
                .contact-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .contact-table th {
                    background: #f8f9fa;
                    color: #495057;
                    font-weight: 600;
                    padding: 16px;
                    text-align: left;
                    border-bottom: 2px solid #e9ecef;
                    font-size: 14px;
                }
                
                .contact-table td {
                    padding: 16px;
                    border-bottom: 1px solid #e9ecef;
                    color: #212529;
                    font-size: 14px;
                }
                
                .contact-table tr:hover {
                    background: #f8f9fa;
                }
                
                .contact-table tr:last-child td {
                    border-bottom: none;
                }
                
                .company-row {
                    background-color: #fff3cd;
                }
                
                .company-row:hover {
                    background-color: #ffeaa7 !important;
                }
                
                .footer-section {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 16px;
                    border-top: 1px solid #e1e5e9;
                }
                
                .submit-button {
                    background: #0d6efd;
                    color: white;
                    border: none;
                    padding: 12px 32px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 500;
                    transition: background-color 0.2s ease;
                }
                
                .submit-button:hover {
                    background: #0b5ed7;
                }
                
                .submit-button:active {
                    background: #0a58ca;
                }
                
                @media (max-width: 768px) {
                    .header-section {
                        flex-direction: column;
                        gap: 16px;
                        align-items: stretch;
                    }
                    
                    .text-input-group {
                        align-items: stretch;
                    }
                    
                    .text-input {
                        width: 100%;
                    }
                    
                    .contact-table {
                        font-size: 12px;
                    }
                    
                    .contact-table th,
                    .contact-table td {
                        padding: 8px;
                    }
                    
                    .table-header {
                        flex-direction: column;
                        gap: 12px;
                        align-items: stretch;
                    }
                }
            </style>
        `;

        // Insert into page
        const targetElement = document.body;
        targetElement.insertAdjacentHTML('beforeend', styles);
        targetElement.appendChild(container);
    }

    // Populate the contact table with data
    function populateContactTable(data = contactData) {
        const tableBody = document.getElementById('contactTableBody');
        tableBody.innerHTML = ''; // Clear existing content
        
        data.forEach((contact, index) => {
            const row = document.createElement('tr');
            const isHubSpotCompany = contact.source === 'hubspot';
            
            if (isHubSpotCompany) {
                row.className = 'company-row';
            }
            
            row.innerHTML = `
                <td>${contact.name || contact.companyName || 'N/A'}</td>
                <td>${contact.email || contact.domain || 'N/A'}</td>
                <td>${contact.phone || 'N/A'}</td>
                <td>${contact.city || 'N/A'}</td>
                <td>${contact.industry || 'N/A'}</td>
            `;
            tableBody.appendChild(row);
        });
        
        updateResultCount(data.length);
    }

    // Update result count display
    function updateResultCount(count) {
        const resultCountElement = document.getElementById('resultCount');
        resultCountElement.textContent = `${count} ${count === 1 ? 'company' : 'companies'}`;
    }

    // Bind event handlers
    function bindEvents() {
        // Search button click handler
        document.addEventListener('click', function(e) {
            if (e.target.id === 'searchBtn') {
                handleSearch();
            }
            
            if (e.target.id === 'submitBtn') {
                handleSubmit();
            }
            
            if (e.target.id === 'clearTableBtn') {
                clearSearchResults();
            }
        });

        // Enter key handler for company name input
        document.addEventListener('keypress', function(e) {
            if (e.target.id === 'companyNameInput' && e.key === 'Enter') {
                handleSearch();
            }
        });
    }

    // Event handlers
    function handleSearch() {
        const companyName = document.getElementById('companyNameInput').value.trim();
        
        if (!companyName) {
            alert('Please enter a company name to search');
            return;
        }
        
        if (!hubspotConfig.isConfigured) {
            alert('HubSpot API token not found. Please ensure the Nintex variable "HubSpotAPIToken" contains your access token.');
            return;
        }
        
        searchHubSpotCompanies(companyName);
    }

    function clearSearchResults() {
        hubspotCompanies = [];
        populateContactTable([]); // Clear the table completely
        document.getElementById('tableTitle').textContent = 'Companies';
    }

    function handleSubmit() {
        const companyNameValue = document.getElementById('companyNameInput').value;
        
        console.log('Form submitted with company name:', companyNameValue);
        
        // Collect form data
        const formData = {
            searchTerm: companyNameValue,
            hubspotCompanies: hubspotCompanies,
            totalRecords: hubspotCompanies.length,
            timestamp: new Date().toISOString()
        };
        
        // Example submission (you can modify this for your needs)
        alert(`Form submitted!\nSearch term: ${companyNameValue}\nHubSpot companies found: ${hubspotCompanies.length}`);
        
        // Here you would typically send data to Nintex workflow or API
        submitToNintex(formData);
    }

    // HubSpot API Functions
    async function testHubSpotConnection() {
        try {
            const url = getApiUrl(`${hubspotConfig.apiUrl}?limit=1`);
            const headers = getApiHeaders();
            
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('HubSpot connection test failed:', error);
            throw error;
        }
    }

    function getApiUrl(baseUrl) {        
        switch (hubspotConfig.corsOption) {
            case 'backend':
                if (hubspotConfig.proxyUrl) {
                    // Map HubSpot API URLs to backend endpoints
                    if (baseUrl.includes('?limit=1')) {
                        return hubspotConfig.proxyUrl + '/hubspot/test';
                    } else if (baseUrl.includes('/search')) {
                        return hubspotConfig.proxyUrl + '/hubspot/companies/search';
                    } else {
                        return hubspotConfig.proxyUrl + '/hubspot/companies';
                    }
                }
                throw new Error('Backend server URL not configured');
            case 'direct':
            default:
                return baseUrl;
        }
    }

    function getApiHeaders() {        
        const headers = {
            'Content-Type': 'application/json'
        };

        if (hubspotConfig.corsOption === 'backend') {
            // For backend server, use X-API-Token header
            headers['X-API-Token'] = hubspotConfig.accessToken;
        } else {
            // Direct API call
            headers['Authorization'] = `Bearer ${hubspotConfig.accessToken}`;
        }

        return headers;
    }

    async function searchHubSpotCompanies(searchTerm) {
        const searchBtn = document.getElementById('searchBtn');
        const searchBtnText = document.getElementById('searchBtnText');
        const searchLoader = document.getElementById('searchLoader');
        
        // Show loading state
        searchBtn.disabled = true;
        searchBtnText.style.display = 'none';
        searchLoader.style.display = 'inline-block';
        
        try {
            let response;
            
            if (hubspotConfig.corsOption === 'backend') {
                // Use backend server endpoint
                response = await callBackendServer(searchTerm);
            } else {
                // Use direct API or CORS proxy
                const searchUrl = getApiUrl(`${hubspotConfig.apiUrl}/search`);
                const searchPayload = {
                    filterGroups: [{
                        filters: [{
                            propertyName: 'name',
                            operator: 'CONTAINS_TOKEN',
                            value: searchTerm
                        }]
                    }],
                    properties: [
                        'name',
                        'domain',
                        'phone',
                        'city',
                        'industry',
                        'website'
                    ],
                    limit: 100
                };
                
                response = await fetch(searchUrl, {
                    method: 'POST',
                    headers: getApiHeaders(),
                    body: JSON.stringify(searchPayload)
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                response = await response.json();
            }
            
            // Process the results
            hubspotCompanies = response.results.map(company => ({
                companyName: company.properties.name || 'N/A',
                domain: company.properties.domain || company.properties.website || 'N/A',
                phone: company.properties.phone || 'N/A',
                city: company.properties.city || 'N/A',
                industry: company.properties.industry || 'N/A',
                source: 'hubspot',
                hubspotId: company.id
            }));
            
            // Display only HubSpot search results
            populateContactTable(hubspotCompanies);
            
            // Update table title
            document.getElementById('tableTitle').textContent = 
                `Companies (${hubspotCompanies.length} found from HubSpot)`;
            
            console.log(`Found ${hubspotCompanies.length} companies matching "${searchTerm}"`);
            
        } catch (error) {
            console.error('HubSpot search failed:', error);
            alert(`Search failed: ${error.message}\n\nTry using a different CORS handling method in the configuration.`);
        } finally {
            // Reset loading state
            searchBtn.disabled = false;
            searchBtnText.style.display = 'inline';
            searchLoader.style.display = 'none';
        }
    }

    async function callBackendServer(searchTerm) {
        // This function would call your backend server
        // which then calls HubSpot API on your behalf
        const backendUrl = hubspotConfig.proxyUrl + '/hubspot/companies/search';
        
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Token': hubspotConfig.accessToken
            },
            body: JSON.stringify({
                searchTerm: searchTerm,
                properties: ['name', 'domain', 'phone', 'city', 'industry', 'website'],
                limit: 100
            })
        });
        
        if (!response.ok) {
            throw new Error(`Backend server error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }

    // Submit data to Nintex (placeholder function)
    function submitToNintex(data) {
        console.log('Submitting to Nintex:', data);
        
        // This is where you would integrate with Nintex APIs
        // Example:
        // NWF.FormFiller.Events.RegisterAfterReady(function() {
        //     // Set form fields or trigger workflows
        // });
        
        // For now, just log the data
        return Promise.resolve(data);
    }

    // Public API for the plugin
    window.NintexHubSpotPlugin = {
        init: initializePlugin,
        config: pluginConfig,
        setHubSpotToken: function(token) {
            hubspotConfig.accessToken = token;
            hubspotConfig.isConfigured = true;
        },
        loadTokenFromNintex: function(variableName) {
            hubspotConfig.nintexVariableName = variableName || 'HubSpotAPIToken';
            return loadHubSpotTokenFromNintex();
        },
        setNintexVariable: function(variableName, value) {
            return setNintexVariable(variableName, value);
        },
        getNintexVariable: function(variableName) {
            return getNintexVariable(variableName);
        },
        searchCompanies: function(searchTerm) {
            if (hubspotConfig.isConfigured) {
                return searchHubSpotCompanies(searchTerm);
            } else {
                throw new Error('HubSpot API not configured');
            }
        },
        getHubSpotCompanies: function() {
            return [...hubspotCompanies];
        },
        getAllData: function() {
            return [...contactData, ...hubspotCompanies];
        },
        clearHubSpotResults: function() {
            clearSearchResults();
        }
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlugin);
    } else {
        initializePlugin();
    }

})();