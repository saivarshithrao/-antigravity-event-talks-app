document.addEventListener('DOMContentLoaded', () => {
    // DOM Cache
    const btnRefresh = document.getElementById('btn-refresh');
    const lastUpdatedTime = document.getElementById('last-updated-time');
    const searchInput = document.getElementById('search-input');
    const clearSearch = document.getElementById('clear-search');
    
    const statTotal = document.getElementById('stat-total');
    const statFeatures = document.getElementById('stat-features');
    const statAnnouncements = document.getElementById('stat-announcements');
    const statIssues = document.getElementById('stat-issues');
    
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const emptyState = document.getElementById('empty-state');
    const timelineFeed = document.getElementById('timeline-feed');
    const btnRetry = document.getElementById('btn-retry');
    const btnClearFilters = document.getElementById('btn-clear-filters');
    
    // Chips and Stats
    const filterChips = document.querySelectorAll('.chip');
    const statBoxes = document.querySelectorAll('.stat-box');
    
    // Modal Element Cache
    const tweetModal = document.getElementById('tweet-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const tweetAttachmentUrl = document.getElementById('tweet-attachment-url');
    const charCount = document.getElementById('char-count');
    const charProgress = document.getElementById('char-progress');
    const btnShareTweet = document.getElementById('btn-share-tweet');

    // App State
    let releaseNotesData = [];
    let currentFilterType = 'all';
    let currentSearchQuery = '';
    let selectedTweetData = { text: '', url: '' };

    // Circular Progress Ring Settings
    const circleRadius = 10;
    const circleCircumference = 2 * Math.PI * circleRadius;
    charProgress.style.strokeDasharray = `${circleCircumference} ${circleCircumference}`;
    charProgress.style.strokeDashoffset = circleCircumference;

    // ==========================================================================
    // INITIALIZATION & FEED FETCHING
    // ==========================================================================
    
    async function fetchReleaseNotes(showSpinner = true) {
        if (showSpinner) {
            loadingState.style.display = 'flex';
            errorState.style.display = 'none';
            emptyState.style.display = 'none';
            timelineFeed.style.display = 'none';
            btnRefresh.classList.add('loading');
            btnRefresh.disabled = true;
        }

        try {
            const response = await fetch('/api/release-notes');
            const result = await response.json();
            
            if (result.success && result.data) {
                releaseNotesData = processRawNotes(result.data);
                updateStatsOverview();
                renderTimeline();
                
                // Update timestamp
                const now = new Date();
                lastUpdatedTime.textContent = `Last updated: ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                
                loadingState.style.display = 'none';
                timelineFeed.style.display = 'flex';
            } else {
                throw new Error(result.error || 'Server returned unsuccessful response.');
            }
        } catch (error) {
            console.error('Fetch Error:', error);
            document.getElementById('error-msg').textContent = error.message || 'Unable to connect to the server.';
            loadingState.style.display = 'none';
            timelineFeed.style.display = 'none';
            errorState.style.display = 'flex';
        } finally {
            btnRefresh.classList.remove('loading');
            btnRefresh.disabled = false;
        }
    }

    // Process raw feed objects into structured formats
    function processRawNotes(rawItems) {
        return rawItems.map(item => {
            // Parse content text and extract separate structured update blocks
            const parsedUpdates = parseUpdateHtml(item.content);
            return {
                ...item,
                updates: parsedUpdates
            };
        });
    }

    // XML Feed items contain updates grouped under one entry.
    // Parse the inner HTML elements to split them by H3 headings.
    function parseUpdateHtml(htmlString) {
        const parserDiv = document.createElement('div');
        parserDiv.innerHTML = htmlString;
        
        const blocks = [];
        let currentType = 'Notice';
        let currentElements = [];
        
        const children = Array.from(parserDiv.children);
        
        children.forEach(child => {
            if (child.tagName === 'H3') {
                // If we already accumulated content elements, push them as a block
                if (currentElements.length > 0) {
                    blocks.push({
                        type: currentType,
                        contentHtml: currentElements.map(el => el.outerHTML).join('')
                    });
                    currentElements = [];
                }
                currentType = child.textContent.trim();
            } else {
                currentElements.push(child);
            }
        });
        
        // Push remaining elements
        if (currentElements.length > 0 || blocks.length === 0) {
            blocks.push({
                type: currentType,
                contentHtml: currentElements.length > 0 
                    ? currentElements.map(el => el.outerHTML).join('') 
                    : htmlString
            });
        }
        
        return blocks;
    }

    // ==========================================================================
    // STATS & CALCULATIONS
    // ==========================================================================
    
    function updateStatsOverview() {
        let total = 0;
        let features = 0;
        let announcements = 0;
        let issues = 0;
        
        releaseNotesData.forEach(item => {
            item.updates.forEach(upd => {
                total++;
                const type = upd.type.toLowerCase();
                if (type.includes('feature')) features++;
                else if (type.includes('announcement')) announcements++;
                else if (type.includes('issue')) issues++;
            });
        });
        
        statTotal.textContent = total;
        statFeatures.textContent = features;
        statAnnouncements.textContent = announcements;
        statIssues.textContent = issues;
    }

    function calculateTimeAgo(dateString) {
        try {
            // Google Feed dates: e.g. "2026-06-16T00:00:00-07:00"
            const updatedTime = new Date(dateString);
            const now = new Date();
            
            // Set times to midnight for date-based comparison
            const date1 = Date.UTC(updatedTime.getFullYear(), updatedTime.getMonth(), updatedTime.getDate());
            const date2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
            
            const diffDays = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            
            const diffWeeks = Math.floor(diffDays / 7);
            if (diffWeeks < 4) return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
            
            const diffMonths = Math.floor(diffDays / 30);
            return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
        } catch (e) {
            return '';
        }
    }

    // ==========================================================================
    // RENDER LOGIC
    // ==========================================================================
    
    function renderTimeline() {
        timelineFeed.innerHTML = '';
        
        let visibleGroupCount = 0;
        
        releaseNotesData.forEach(item => {
            // Filter the updates inside this entry
            const filteredUpdates = item.updates.filter(upd => {
                // Category Filter
                if (currentFilterType !== 'all') {
                    if (currentFilterType.toLowerCase() === 'feature' && !upd.type.toLowerCase().includes('feature')) return false;
                    if (currentFilterType.toLowerCase() === 'announcement' && !upd.type.toLowerCase().includes('announcement')) return false;
                    if (currentFilterType.toLowerCase() === 'issue' && !upd.type.toLowerCase().includes('issue')) return false;
                    if (currentFilterType.toLowerCase() === 'deprecation' && !upd.type.toLowerCase().includes('deprecation')) return false;
                }
                
                // Search Keyword Filter
                if (currentSearchQuery.trim() !== '') {
                    const query = currentSearchQuery.toLowerCase();
                    const textContent = stripHtml(upd.contentHtml).toLowerCase();
                    const typeText = upd.type.toLowerCase();
                    const dateText = item.title.toLowerCase();
                    
                    if (!textContent.includes(query) && !typeText.includes(query) && !dateText.includes(query)) {
                        return false;
                    }
                }
                
                return true;
            });
            
            // If no updates inside this date match, don't show the card
            if (filteredUpdates.length === 0) return;
            
            visibleGroupCount++;
            
            // Render Group Card
            const timeAgoText = calculateTimeAgo(item.updated);
            
            const groupEl = document.createElement('div');
            groupEl.className = 'timeline-group';
            
            // Side Date Marker
            const dateMarkerHTML = `
                <div class="timeline-date-marker">
                    <div class="date-dot"></div>
                    <span class="date-text">${item.title}</span>
                    <span class="date-ago">${timeAgoText}</span>
                </div>
            `;
            
            // Card Content
            let updatesHTML = '';
            filteredUpdates.forEach(upd => {
                let badgeClass = 'badge-notice';
                let typeIcon = 'fa-solid fa-bell';
                const lowerType = upd.type.toLowerCase();
                
                if (lowerType.includes('feature')) {
                    badgeClass = 'badge-feature';
                    typeIcon = 'fa-solid fa-sparkles';
                } else if (lowerType.includes('announcement')) {
                    badgeClass = 'badge-announcement';
                    typeIcon = 'fa-solid fa-bullhorn';
                } else if (lowerType.includes('issue')) {
                    badgeClass = 'badge-issue';
                    typeIcon = 'fa-solid fa-circle-exclamation';
                } else if (lowerType.includes('deprecation')) {
                    badgeClass = 'badge-deprecation';
                    typeIcon = 'fa-solid fa-trash-can';
                }
                
                // Plaintext snippet for Tweet extraction
                const cleanText = stripHtml(upd.contentHtml).trim();
                
                updatesHTML += `
                    <div class="update-block">
                        <div class="update-badge-header">
                            <span class="badge ${badgeClass}">
                                <i class="${typeIcon}"></i> ${upd.type}
                            </span>
                            <button class="btn-tweet-trigger" data-date="${item.title}" data-type="${upd.type}" data-text="${encodeURIComponent(cleanText)}" data-url="${item.link}">
                                <i class="fa-brands fa-x-twitter"></i> Tweet
                            </button>
                        </div>
                        <div class="update-desc">${upd.contentHtml}</div>
                    </div>
                `;
            });
            
            const cardElHTML = `
                <div class="timeline-card glass-card">
                    ${updatesHTML}
                </div>
            `;
            
            groupEl.innerHTML = dateMarkerHTML + cardElHTML;
            timelineFeed.appendChild(groupEl);
        });
        
        // Show/hide empty states
        if (visibleGroupCount === 0) {
            timelineFeed.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            timelineFeed.style.display = 'flex';
        }
    }

    // Helper to strip HTML formatting to extract clean text snippets
    function stripHtml(html) {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        // Add spacing for link contents to avoid concatenated strings
        const links = tmp.querySelectorAll('a');
        links.forEach(link => {
            link.innerHTML = ` ${link.innerHTML} `;
        });
        return tmp.textContent || tmp.innerText || "";
    }

    // ==========================================================================
    // FILTER INTERACTION
    // ==========================================================================
    
    function setCategoryFilter(type) {
        currentFilterType = type;
        
        // Highlight correct chip
        filterChips.forEach(chip => {
            if (chip.getAttribute('data-type') === type) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
        
        // Highlight overview stat boxes accordingly
        statBoxes.forEach(box => {
            const boxFilter = box.getAttribute('data-filter');
            if (boxFilter.toLowerCase() === type.toLowerCase() || (type === 'all' && boxFilter === 'all')) {
                box.classList.add('active');
            } else {
                box.classList.remove('active');
            }
        });
        
        renderTimeline();
    }

    // ==========================================================================
    // SEARCH INTERACTION
    // ==========================================================================
    
    searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value;
        if (currentSearchQuery.length > 0) {
            clearSearch.style.display = 'flex';
        } else {
            clearSearch.style.display = 'none';
        }
        renderTimeline();
    });

    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearch.style.display = 'none';
        renderTimeline();
        searchInput.focus();
    });

    // ==========================================================================
    // TWEET COMPOSER MODAL HANDLERS
    // ==========================================================================
    
    // Attach listener to timeline clicks via delegation
    timelineFeed.addEventListener('click', (e) => {
        const trigger = e.target.closest('.btn-tweet-trigger');
        if (!trigger) return;
        
        const date = trigger.getAttribute('data-date');
        const type = trigger.getAttribute('data-type');
        const rawText = decodeURIComponent(trigger.getAttribute('data-text'));
        const url = trigger.getAttribute('data-url');
        
        // Clean double spaces and linebreaks
        const formattedRawText = rawText.replace(/\s+/g, ' ').trim();
        
        // Formulate safe draft message text
        const prefix = `BigQuery Update (${date}) - [${type}]: `;
        const hashtags = "\n#BigQuery #GCP";
        
        // Let's preserve space for prefix, url, and hashtags
        const urlLength = 23; // standard length for links in tweet
        const reservedLen = prefix.length + urlLength + hashtags.length + 4; // safety offset
        const maxSnippetLen = 280 - reservedLen;
        
        let snippet = formattedRawText;
        if (snippet.length > maxSnippetLen) {
            snippet = snippet.substring(0, maxSnippetLen - 3) + "...";
        }
        
        const fullTweetText = `${prefix}${snippet}${hashtags}`;
        
        openTweetModal(fullTweetText, url);
    });

    function openTweetModal(text, url) {
        selectedTweetData.text = text;
        selectedTweetData.url = url;
        
        tweetTextarea.value = text;
        tweetAttachmentUrl.textContent = url.replace('https://', '').split('#')[0]; // clean url presentation
        
        // Trigger check
        updateCharCount();
        
        tweetModal.style.display = 'flex';
        tweetTextarea.focus();
        
        // Set cursor to end
        tweetTextarea.selectionStart = tweetTextarea.selectionEnd = tweetTextarea.value.length;
    }

    function closeTweetModal() {
        tweetModal.style.display = 'none';
    }

    function updateCharCount() {
        const currentLen = tweetTextarea.value.length;
        charCount.textContent = currentLen;
        
        // Set styles based on character limit state
        if (currentLen > 280) {
            charCount.style.color = 'var(--color-issue)';
            btnShareTweet.disabled = true;
        } else {
            charCount.style.color = 'var(--text-secondary)';
            btnShareTweet.disabled = false;
        }
        
        // Progress Circle Offset
        const progressPercentage = Math.min(currentLen / 280, 1);
        const offset = circleCircumference - (progressPercentage * circleCircumference);
        charProgress.style.strokeDashoffset = offset;
        
        // Dynamic colors for progress ring based on characters remaining
        if (currentLen >= 280) {
            charProgress.style.stroke = 'var(--color-issue)';
        } else if (currentLen >= 260) {
            charProgress.style.stroke = 'var(--color-notice)';
        } else {
            charProgress.style.stroke = 'var(--accent-blue)';
        }
    }

    // ==========================================================================
    // LISTENERS & EVENT REGISTRATION
    // ==========================================================================
    
    // Refresh handlers
    btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));
    btnRetry.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Chip triggers
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            setCategoryFilter(chip.getAttribute('data-type'));
        });
    });

    // Stat card shortcuts
    statBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const filterType = box.getAttribute('data-filter');
            setCategoryFilter(filterType);
        });
    });
    
    // Clear filters helper
    btnClearFilters.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        clearSearch.style.display = 'none';
        setCategoryFilter('all');
    });

    // Close Modal triggers
    btnCloseModal.addEventListener('click', closeTweetModal);
    
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeTweetModal();
        }
    });

    // Text Area counting
    tweetTextarea.addEventListener('input', updateCharCount);

    // Share action
    btnShareTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        const url = selectedTweetData.url;
        
        // Compile X (Twitter) Web Intent URL
        const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        
        window.open(shareUrl, '_blank', 'width=550,height=420,toolbar=0,status=0');
        closeTweetModal();
    });

    // Handle Escape Key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tweetModal.style.display === 'flex') {
            closeTweetModal();
        }
    });

    // ==========================================================================
    // BOOTSTRAP SYSTEM
    // ==========================================================================
    
    fetchReleaseNotes(true);
});
