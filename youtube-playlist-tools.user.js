// ==UserScript==
// @name         YouTube Playlist Enhancement Suite
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  Adds Watch Later, Copy Link, and Remove from Playlist buttons to playlist videos
// @author       https://github.com/babanpic
// @supportURL   https://ko-fi.com/babanpic
// @match        https://www.youtube.com/playlist?*
// @match        https://www.youtube.com/watch?*
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CONFIG = {
        // Features
        enableThumbnailWatchLater: true,
        enableMenuWatchLater: false,
        enableMenuCopyLink: true,
        enableMenuRemoveButton: true,

        // Positioning
        thumbnailOffsetX: 8,
        thumbnailOffsetY: 8,
        buttonSpacing: 70,
        buttonsOffsetX: -70,
        buttonsOffsetY: 3,

        debug: false
    };

    let processingVideoId = null;
    let isProcessingBatch = false;
    let processedVideos = new WeakSet();
    let repositionHandlers = new WeakMap();
    let currentPageType = null;
    let lastUrl = window.location.href;
    let initTimeout = null;

    function debugLog(...args) {
        if (CONFIG.debug) console.log('[PlaylistSuite]', ...args);
    }

    // Check if current page is a playlist page
    function isPlaylistPage() {
        const url = window.location.href;
        return url.includes('/playlist?list=') ||
               url.includes('/watch?list=') ||
               document.querySelector('ytd-playlist-video-list-renderer') !== null;
    }

    function getVideoId(videoCard) {
        const watchLink = videoCard.querySelector('a[href*="/watch?v="]');
        if (!watchLink) return null;
        const match = watchLink.href.match(/[&?]v=([^&]+)/);
        return match ? match[1] : null;
    }

    function getVideoUrl(videoCard) {
        const watchLink = videoCard.querySelector('a[href*="/watch?v="]');
        if (!watchLink) return null;
        return watchLink.href.split('&list=')[0];
    }

    async function clickMenuItemByText(videoCard, searchText, actionName) {
        document.body.click();
        await new Promise(r => setTimeout(r, 200));

        const menuButton = videoCard.querySelector('#menu yt-icon-button#button, #menu #button');
        if (!menuButton) throw new Error('Menu button not found');

        menuButton.click();

        let attempts = 0;
        let menu = null;
        while (attempts < 30 && !menu) {
            await new Promise(r => setTimeout(r, 100));
            menu = document.querySelector('ytd-menu-popup-renderer, yt-sheet-view-model');
            attempts++;
        }
        if (!menu) throw new Error('Menu did not appear');

        const menuItems = menu.querySelectorAll('#items > ytd-menu-service-item-renderer');
        let foundItem = null;

        for (let i = 0; i < menuItems.length; i++) {
            const item = menuItems[i];
            const text = item.textContent.toLowerCase();
            if (text.includes(searchText.toLowerCase())) {
                foundItem = item;
                break;
            }
        }

        if (!foundItem) throw new Error(`Menu item with text "${searchText}" not found`);

        foundItem.click();
    }

    async function addToWatchLater(videoCard, videoId, buttonElement) {
        if (processingVideoId === videoId) return;
        processingVideoId = videoId;

        const originalText = buttonElement.textContent;
        const originalBg = buttonElement.style.backgroundColor;

        buttonElement.textContent = '⏳';
        buttonElement.style.backgroundColor = '#ff8c00';
        buttonElement.disabled = true;

        try {
            await clickMenuItemByText(videoCard, 'watch later', 'Watch Later');

            buttonElement.textContent = '✓';
            buttonElement.style.backgroundColor = '#2ba640';

            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 2000);
        } catch (error) {
            console.error('[PlaylistSuite] Watch Later error:', error);
            buttonElement.textContent = '✗';
            buttonElement.style.backgroundColor = '#ff0000';
            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 1500);
        }
        document.body.click();
    }

    async function copyVideoLink(videoCard, videoId, buttonElement) {
        if (processingVideoId === videoId) return;
        processingVideoId = videoId;

        const originalText = buttonElement.textContent;
        const originalBg = buttonElement.style.backgroundColor;

        buttonElement.textContent = '⏳';
        buttonElement.style.backgroundColor = '#ff8c00';
        buttonElement.disabled = true;

        try {
            const videoUrl = getVideoUrl(videoCard);
            if (!videoUrl) throw new Error('Could not get video URL');

            await navigator.clipboard.writeText(videoUrl);

            buttonElement.textContent = '✓';
            buttonElement.style.backgroundColor = '#2ba640';

            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 2000);
        } catch (error) {
            console.error('[PlaylistSuite] Copy link error:', error);
            buttonElement.textContent = '✗';
            buttonElement.style.backgroundColor = '#ff0000';
            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 1500);
        }
    }

    async function removeFromPlaylist(videoCard, videoId, buttonElement) {
        if (processingVideoId === videoId) return;
        processingVideoId = videoId;

        const originalText = buttonElement.textContent;
        const originalBg = buttonElement.style.backgroundColor;

        buttonElement.textContent = '⏳';
        buttonElement.style.backgroundColor = '#ff8c00';
        buttonElement.disabled = true;

        try {
            await clickMenuItemByText(videoCard, 'remove from', 'Remove from Playlist');

            buttonElement.textContent = '✓';
            buttonElement.style.backgroundColor = '#2ba640';

            cleanupVideoButtons(videoCard);

            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 2000);
        } catch (error) {
            console.error('[PlaylistSuite] Remove error:', error);
            buttonElement.textContent = '✗';
            buttonElement.style.backgroundColor = '#ff0000';
            setTimeout(() => {
                if (buttonElement && buttonElement.isConnected) {
                    buttonElement.textContent = originalText;
                    buttonElement.style.backgroundColor = originalBg;
                    buttonElement.disabled = false;
                }
                processingVideoId = null;
            }, 1500);
        }
        document.body.click();
    }

    function cleanupVideoButtons(videoCard) {
        const buttons = videoCard.querySelectorAll('.playlist-custom-btn');
        buttons.forEach(btn => {
            const handler = repositionHandlers.get(btn);
            if (handler) {
                window.removeEventListener('scroll', handler);
                window.removeEventListener('resize', handler);
                repositionHandlers.delete(btn);
            }
            btn.remove();
        });
        processedVideos.delete(videoCard);
    }

    function createMenuButton(videoId, videoCard, action, icon, tooltip, color, hoverColor) {
        const btn = document.createElement('button');
        btn.textContent = icon;
        btn.title = tooltip;
        btn.classList.add('playlist-custom-btn');

        btn.style.cssText = `
            background: ${color};
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            font-family: 'Roboto', Arial, sans-serif;
            pointer-events: auto;
            position: absolute;
            z-index: 1000;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.backgroundColor = hoverColor;
            btn.style.transform = 'scale(1.05)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.backgroundColor = color;
            btn.style.transform = 'scale(1)';
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            action(videoCard, videoId, btn);
        });

        return btn;
    }

    function positionMenuButtons(buttons, menuContainer, videoCard) {
        const menuRect = menuContainer.getBoundingClientRect();
        const videoRect = videoCard.getBoundingClientRect();

        const baseLeft = menuRect.left - videoRect.left + CONFIG.buttonsOffsetX;

        buttons.forEach((btn, idx) => {
            const buttonIndex = buttons.length - 1 - idx;
            const leftOffset = buttonIndex * CONFIG.buttonSpacing;
            btn.style.left = (baseLeft - leftOffset) + 'px';
            btn.style.top = (menuRect.top - videoRect.top + CONFIG.buttonsOffsetY) + 'px';
        });
    }

    function addButtonsToVideo(videoCard) {
        if (processedVideos.has(videoCard)) return;

        const videoId = getVideoId(videoCard);
        if (!videoId) return;

        processedVideos.add(videoCard);

        if (getComputedStyle(videoCard).position === 'static') {
            videoCard.style.position = 'relative';
        }

        // Thumbnail button
        if (CONFIG.enableThumbnailWatchLater) {
            const thumbnailContainer = videoCard.querySelector('#thumbnail');
            if (thumbnailContainer && !thumbnailContainer.querySelector('.playlist-thumbnail-btn')) {
                const watchLaterBtn = createMenuButton(videoId, videoCard, addToWatchLater, '⏱️', 'Save to Watch Later', 'rgba(0, 0, 0, 0.75)', '#3ea6ff');
                watchLaterBtn.classList.add('playlist-thumbnail-btn');
                watchLaterBtn.style.position = 'absolute';
                watchLaterBtn.style.top = `${CONFIG.thumbnailOffsetY}px`;
                watchLaterBtn.style.right = `${CONFIG.thumbnailOffsetX}px`;
                watchLaterBtn.style.left = 'auto';
                thumbnailContainer.appendChild(watchLaterBtn);
            }
        }

        // Menu buttons
        const menuButtons = [];

        if (CONFIG.enableMenuCopyLink) {
            menuButtons.push(createMenuButton(videoId, videoCard, copyVideoLink, '🔗', 'Copy link', 'rgba(0, 0, 0, 0.75)', '#3ea6ff'));
        }
        if (CONFIG.enableMenuWatchLater) {
            menuButtons.push(createMenuButton(videoId, videoCard, addToWatchLater, '⏱️', 'Save to Watch Later', 'rgba(0, 0, 0, 0.75)', '#3ea6ff'));
        }
        if (CONFIG.enableMenuRemoveButton) {
            menuButtons.push(createMenuButton(videoId, videoCard, removeFromPlaylist, '🗑️', 'Remove from playlist', 'rgba(180, 60, 50, 0.8)', '#ff6b5e'));
        }

        if (menuButtons.length > 0) {
            const menuContainer = videoCard.querySelector('#menu');
            if (menuContainer) {
                menuButtons.forEach(btn => {
                    videoCard.appendChild(btn);
                });

                positionMenuButtons(menuButtons, menuContainer, videoCard);

                const repositionHandler = () => {
                    if (videoCard.isConnected) {
                        positionMenuButtons(menuButtons, menuContainer, videoCard);
                    }
                };

                let ticking = false;
                const optimizedReposition = () => {
                    if (!ticking) {
                        requestAnimationFrame(() => {
                            repositionHandler();
                            ticking = false;
                        });
                        ticking = true;
                    }
                };

                menuButtons.forEach(btn => {
                    repositionHandlers.set(btn, optimizedReposition);
                });

                window.addEventListener('scroll', optimizedReposition, { passive: true });
                window.addEventListener('resize', optimizedReposition);
            }
        }
    }

    function processPlaylistVideos() {
        // Only run on playlist pages
        if (!isPlaylistPage()) {
            debugLog('Not a playlist page, skipping');
            return;
        }

        if (isProcessingBatch) return;

        isProcessingBatch = true;

        try {
            const videos = document.querySelectorAll('ytd-playlist-video-renderer');
            debugLog(`Processing ${videos.length} videos on playlist page`);

            videos.forEach((video) => {
                if (!processedVideos.has(video)) {
                    addButtonsToVideo(video);
                }
            });
        } finally {
            isProcessingBatch = false;
        }
    }

    // Reset state for new page
    function resetForNewPage() {
        debugLog('Page navigation detected, resetting state');
        processedVideos = new WeakSet();
        repositionHandlers = new WeakMap();

        // Clear any pending timeout
        if (initTimeout) {
            clearTimeout(initTimeout);
        }

        // Wait a bit for the page to stabilize
        initTimeout = setTimeout(() => {
            processPlaylistVideos();
            initTimeout = null;
        }, 500);
    }

    // Monitor URL changes (works for all YouTube navigations)
    function observeUrlChanges() {
        let currentUrl = window.location.href;

        setInterval(() => {
            const newUrl = window.location.href;
            if (newUrl !== currentUrl) {
                debugLog(`URL changed from ${currentUrl} to ${newUrl}`);
                currentUrl = newUrl;
                resetForNewPage();
            }
        }, 500);
    }

    // Observe DOM changes for playlist container (for dynamic loading)
    function observePlaylistContainer() {
        const observer = new MutationObserver(() => {
            if (isPlaylistPage()) {
                // When new videos are loaded into the playlist container
                setTimeout(processPlaylistVideos, 200);
            }
        });

        // Watch for changes in the main content area
        const targetNode = document.querySelector('#contents, ytd-playlist-video-list-renderer, ytd-app');
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
            debugLog('DOM observer started');
        } else {
            setTimeout(observePlaylistContainer, 1000);
        }
    }

    function init() {
        debugLog('=== YouTube Playlist Enhancement Suite Started ===');

        // Initial check
        setTimeout(() => {
            if (isPlaylistPage()) {
                processPlaylistVideos();
            }
        }, 1500);

        // Listen for YouTube's navigation events
        document.addEventListener('yt-navigate-finish', () => {
            debugLog('yt-navigate-finish detected');
            resetForNewPage();
        });

        // Also listen for yt-page-data-updated (another YouTube event)
        document.addEventListener('yt-page-data-updated', () => {
            debugLog('yt-page-data-updated detected');
            resetForNewPage();
        });

        // URL change monitor as fallback
        observeUrlChanges();

        // Monitor playlist container for dynamic content
        observePlaylistContainer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
