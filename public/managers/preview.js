/**
 * PreviewManager handles all markdown preview functionality including:
 * - Toggling between edit, split, and preview modes
 * - Rendering markdown content
 * - Managing preview styles and state
 * - Adding copy buttons to code blocks
 * - Handling resizable split view
 */
export class PreviewManager {
    constructor({
        editor,
        editorContainer,
        previewContainer,
        previewPane,
        previewMarkdownBtn,
        toaster,
        collaborationManager,
        marked,
    }) {
        this.editor = editor;
        this.editorContainer = editorContainer;
        this.previewContainer = previewContainer;
        this.previewPane = previewPane;
        this.previewMarkdownBtn = previewMarkdownBtn;
        this.toaster = toaster;
        this.collaborationManager = collaborationManager;
        this.marked = marked;
        
        // Preview modes: 'off', 'split', 'preview-only'
        this.previewMode = 'off';
        this.DEBUG = false;
        
        // Get the wrapper element for split view
        this.editorPreviewWrapper = document.getElementById('editor-preview-wrapper');
        this.resizeHandle = document.getElementById('resize-handle');
        
        // Initialize resize functionality
        this.initializeResize();
    }

    /**
     * Get current preview mode state
     */
    getPreviewMode() {
        return this.previewMode;
    }

    /**
     * Set preview mode state
     */
    setPreviewMode(mode) {
        this.previewMode = mode;
    }

    /**
     * Check if preview is active (split or preview-only)
     */
    get isPreviewActive() {
        return this.previewMode === 'split' || this.previewMode === 'preview-only';
    }

    /**
     * Initialize resize handle functionality for split view
     */
    initializeResize() {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startEditorWidth = 0;
        let startPreviewWidth = 0;
        let startEditorHeight = 0;
        let startPreviewHeight = 0;

        const startResize = (e) => {
            if (this.previewMode !== 'split') return;
            
            isResizing = true;
            
            // Get coordinates from either mouse or touch event
            const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
            const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
            
            startX = clientX;
            startY = clientY;
            startEditorWidth = this.editorContainer.offsetWidth;
            startPreviewWidth = this.previewContainer.offsetWidth;
            startEditorHeight = this.editorContainer.offsetHeight;
            startPreviewHeight = this.previewContainer.offsetHeight;
            
            // Add both mouse and touch event listeners
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchmove', doResize, { passive: false });
            document.addEventListener('touchend', stopResize);
            document.addEventListener('touchcancel', stopResize);
            
            // Check if we're in mobile layout (vertical split)
            const isMobile = window.innerWidth <= 585;
            document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize';
            document.body.style.userSelect = 'none';
            
            // Prevent default to stop scrolling on touch
            e.preventDefault();
        };

        const doResize = (e) => {
            if (!isResizing) return;
            
            // Get coordinates from either mouse or touch event
            const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
            const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
            
            // Check if we're in mobile layout (vertical split)
            const isMobile = window.innerWidth <= 585;
            
            if (isMobile) {
                // Vertical resizing for mobile
                const deltaY = clientY - startY;
                const wrapperHeight = this.editorPreviewWrapper.offsetHeight;
                const handleHeight = this.resizeHandle.offsetHeight;
                
                const newEditorHeight = startEditorHeight + deltaY;
                const newPreviewHeight = startPreviewHeight - deltaY;
                
                // Enforce minimum heights
                const minHeight = 100;
                const maxEditorHeight = wrapperHeight - minHeight - handleHeight;
                const maxPreviewHeight = wrapperHeight - minHeight - handleHeight;
                
                if (newEditorHeight >= minHeight && newEditorHeight <= maxEditorHeight &&
                    newPreviewHeight >= minHeight && newPreviewHeight <= maxPreviewHeight) {
                    
                    this.editorContainer.style.height = `${newEditorHeight}px`;
                    this.previewContainer.style.height = `${newPreviewHeight}px`;
                }
            } else {
                // Horizontal resizing for desktop
                const deltaX = clientX - startX;
                const wrapperWidth = this.editorPreviewWrapper.offsetWidth;
                const handleWidth = this.resizeHandle.offsetWidth;
                
                const newEditorWidth = startEditorWidth + deltaX;
                const newPreviewWidth = startPreviewWidth - deltaX;
                
                // Enforce minimum widths
                const minWidth = 200;
                const maxEditorWidth = wrapperWidth - minWidth - handleWidth;
                const maxPreviewWidth = wrapperWidth - minWidth - handleWidth;
                
                if (newEditorWidth >= minWidth && newEditorWidth <= maxEditorWidth &&
                    newPreviewWidth >= minWidth && newPreviewWidth <= maxPreviewWidth) {
                    
                    this.editorContainer.style.width = `${newEditorWidth}px`;
                    this.previewContainer.style.width = `${newPreviewWidth}px`;
                }
            }
            
            // Prevent default to stop scrolling on touch
            e.preventDefault();
        };

        const stopResize = () => {
            isResizing = false;
            // Remove both mouse and touch event listeners
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchmove', doResize);
            document.removeEventListener('touchend', stopResize);
            document.removeEventListener('touchcancel', stopResize);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        // Add both mouse and touch event listeners for the resize handle
        this.resizeHandle.addEventListener('mousedown', startResize);
        this.resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        
        // Additional touch event handling for better mobile support
        this.resizeHandle.addEventListener('touchcancel', stopResize);
        
        // Add visual feedback for touch on mobile
        if ('ontouchstart' in window) {
            this.resizeHandle.addEventListener('touchstart', () => {
                this.resizeHandle.style.backgroundColor = 'var(--primary-color)';
            });
            
            this.resizeHandle.addEventListener('touchend', () => {
                setTimeout(() => {
                    this.resizeHandle.style.backgroundColor = '';
                }, 100);
            });
        }
    }

    /**
     * Toggle between edit, split, and preview modes (3-way cycle)
     */
    async toggleMarkdownPreview(toggle, enable, enableStatusMessage = true) {
        if (toggle) {
            // Cycle through modes: off -> split -> preview-only -> off
            switch (this.previewMode) {
                case 'off':
                    this.previewMode = 'split';
                    break;
                case 'split':
                    this.previewMode = 'preview-only';
                    break;
                case 'preview-only':
                    this.previewMode = 'off';
                    break;
                default:
                    this.previewMode = 'off';
            }
        } else {
            // Direct mode setting for settings/initialization
            if (typeof enable === 'string') {
                this.previewMode = enable;
            } else {
                this.previewMode = enable ? 'preview-only' : 'off';
            }
        }
        
        // Apply the layout based on current mode
        await this.applyPreviewMode(enableStatusMessage);
    }

    /**
     * Apply the current preview mode to the UI
     */
    async applyPreviewMode(enableStatusMessage = true) {
        // Remove all mode classes
        this.editorPreviewWrapper.classList.remove('split-view', 'preview-only');
        
        switch (this.previewMode) {
            case 'split':
                this.editorPreviewWrapper.classList.add('split-view');
                this.previewContainer.style.display = 'block';
                this.resizeHandle.style.display = 'flex';
                this.previewMarkdownBtn.classList.add('active');
                
                this.inheritEditorStyles(this.previewPane);
                await this.renderMarkdownPreview(this.editor.value);
                
                if (enableStatusMessage) {
                    this.toaster.show('Split Preview On', 'success');
                }
                break;
                
            case 'preview-only':
                this.editorPreviewWrapper.classList.add('preview-only');
                this.previewContainer.style.display = 'block';
                this.resizeHandle.style.display = 'none';
                this.previewMarkdownBtn.classList.add('active');
                
                // Reset container dimensions
                this.editorContainer.style.width = '';
                this.previewContainer.style.width = '';
                this.editorContainer.style.height = '';
                this.previewContainer.style.height = '';
                
                this.inheritEditorStyles(this.previewPane);
                await this.renderMarkdownPreview(this.editor.value);
                
                if (enableStatusMessage) {
                    this.toaster.show('Full Preview On', 'success');
                }
                break;
                
            case 'off':
            default:
                this.previewContainer.style.display = 'none';
                this.resizeHandle.style.display = 'none';
                this.previewMarkdownBtn.classList.remove('active');
                
                // Reset container dimensions
                this.editorContainer.style.width = '';
                this.previewContainer.style.width = '';
                this.editorContainer.style.height = '';
                this.previewContainer.style.height = '';
                
                this.editor.focus();
                
                if (enableStatusMessage) {
                    this.toaster.show('Editor On');
                }
                break;
        }
        
        this.collaborationManager.updateLocalCursor();
    }

    /**
     * Inherit editor styles for the preview pane
     */
    inheritEditorStyles(element) {
        element.style.backgroundColor = window.getComputedStyle(this.editor).backgroundColor;
        element.style.color = window.getComputedStyle(this.editor).color;
        element.style.padding = window.getComputedStyle(this.editor).padding;
    }

    /**
     * Update preview styles when theme changes
     * This method should be called from theme toggle events
     */
    updatePreviewStyles() {
        // Only update if preview is currently active
        if (this.isPreviewActive) {
            // Listen for transition end on the editor to ensure styles have updated
            const handleTransitionEnd = (event) => {
                // Only respond to background-color or color transitions on the editor
                if ((event.propertyName === 'background-color' || event.propertyName === 'color') && 
                    event.target === this.editor) {
                    this.inheritEditorStyles(this.previewPane);
                    this.editor.removeEventListener('transitionend', handleTransitionEnd);
                }
            };
            
            this.editor.addEventListener('transitionend', handleTransitionEnd);
            
            // Fallback timeout in case transitionend doesn't fire
            setTimeout(() => {
                this.editor.removeEventListener('transitionend', handleTransitionEnd);
                this.inheritEditorStyles(this.previewPane);
            }, 200);
        }
    }

    /**
     * Add copy buttons with language labels to code blocks
     * @param {HTMLElement|string} target - Either a DOM element or HTML string to process
     * @param {boolean} printMode - Whether this is for print (disables copy functionality)
     * @returns {string|void} - Returns HTML string if target was a string, void if target was DOM element
     */
    addCopyLangButtonsToCodeBlocks(target = null, printMode = false) {
        let container;
        let returnString = false;
        
        // Determine the target container
        if (typeof target === 'string') {
            // Working with HTML string (for print)
            container = document.createElement('div');
            container.innerHTML = target;
            returnString = true;
        } else if (target instanceof HTMLElement) {
            // Working with DOM element
            container = target;
        } else {
            // Default to preview pane
            container = this.previewPane;
        }
        
        const codeBlocks = container.querySelectorAll('pre');
        
        codeBlocks.forEach(pre => {
            // Remove existing copy button if present
            const existingButton = pre.querySelector('.code-lang-copy-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            // Extract language from code element classes
            const codeElement = pre.querySelector('code');
            let language = 'text';
            if (codeElement && codeElement.className) {
                // Look for hljs language- class pattern - support hyphens and other valid chars
                const langMatch = codeElement.className.match(/language-([\w-]+)/);
                if (langMatch) {
                    language = langMatch[1];
                } else if (codeElement.className.includes('hljs')) {
                    // If hljs class exists but no specific language, it was auto-detected
                    language = 'auto';
                }
            }
            
            // Create button element (div for print mode, button for interactive mode)
            const langButton = document.createElement(printMode ? 'div' : 'button');
            langButton.className = `code-lang-copy-button${printMode ? ' print-label' : ''}`;
            langButton.setAttribute('aria-label', printMode ? 
                `Code language: ${language}` : 
                `Code language: ${language}. Click to copy code to clipboard`);
            
            // Create the language text span
            const langText = document.createElement('span');
            langText.className = 'lang-text';
            langText.textContent = language;
            langButton.appendChild(langText);
            
            // Add copy functionality only for interactive mode
            if (!printMode) {
                // Create the copy icon (initially hidden)
                const copyIcon = document.createElement('span');
                copyIcon.className = 'copy-icon';
                copyIcon.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
                        <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                    </svg>
                `;
                langButton.appendChild(copyIcon);
                
                // Add click handler for copying
                langButton.addEventListener('click', async () => {
                    const textToCopy = codeElement ? codeElement.textContent : pre.textContent;
                    
                    try {
                        await navigator.clipboard.writeText(textToCopy);
                        this.toaster.show('Copied to clipboard');
                    } catch (err) {
                        // Fallback for older browsers
                        const textArea = document.createElement('textarea');
                        textArea.value = textToCopy;
                        document.body.appendChild(textArea);
                        textArea.select();
                        
                        try {
                            document.execCommand('copy');
                            this.toaster.show('Copied to clipboard');
                        } catch (fallbackErr) {
                            this.toaster.show('Failed to copy code', 'error');
                        }
                        
                        document.body.removeChild(textArea);
                    }
                });
            }
            
            // Add the button to the pre element
            pre.appendChild(langButton);
            
            // Ensure the pre element is wide enough to accommodate the button
            this.ensurePreMinWidth(pre, langButton, printMode);
        });
        
        // Return HTML string if we were working with a string
        return returnString ? container.innerHTML : undefined;
    }

    /**
     * Ensure the pre element has sufficient minimum width to accommodate the language/copy button
     * @param {HTMLElement} pre - The pre element containing the code block
     * @param {HTMLElement} button - The language/copy button element
     * @param {boolean} printMode - Whether this is for print mode
     */
    ensurePreMinWidth(pre, button, printMode = false) {
        if (printMode) {
            // For print mode, use CSS-based minimum width since DOM measurements aren't reliable
            // Estimate button width based on typical language names and styling
            pre.style.minWidth = '120px';
        } else {
            // For interactive mode, measure the actual button width after it's rendered
            // Use requestAnimationFrame to ensure the button is fully rendered
            requestAnimationFrame(() => {
                const buttonWidth = button.offsetWidth;
                
                // Only proceed if the button has been rendered (has dimensions)
                if (buttonWidth > 0) {
                    const currentMinWidth = parseInt(pre.style.minWidth) || 0;
                    
                    // Set minimum width to at least the button width plus padding
                    // Add extra padding to ensure the button doesn't appear cramped
                    const requiredMinWidth = buttonWidth + 20;
                    
                    if (requiredMinWidth > currentMinWidth) {
                        pre.style.minWidth = `${requiredMinWidth}px`;
                    }
                } else {
                    // Fallback if button dimensions aren't available
                    // Use a reasonable minimum based on typical button sizes
                    const fallbackMinWidth = parseInt(pre.style.minWidth) || 120;
                    if (fallbackMinWidth < 120) {
                        pre.style.minWidth = '120px';
                    }
                }
            });
        }
    }

    /**
     * Clear the preview pane content
     */
    clearPreview() {
        this.previewPane.innerHTML = '';
    }

    /**
     * Update preview content if in preview mode
     */
    async updatePreviewIfActive(content) {
        if (this.isPreviewActive) {
            await this.renderMarkdownPreview(content);
        }
    }

    /**
     * Generate formatted content for printing
     */
    getFormattedContentForPrint(content, isMarkdownFile) {
        if (isMarkdownFile || this.isPreviewActive) {
            return this.marked.parse(content);
        } else {
            return content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
        }
    }

    /**
     * Auto-expand details elements for print
     */
    expandDetailsForPrint(formattedContent) {
        if (formattedContent.includes('<details')) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formattedContent;
            
            // Find all details elements and add the 'open' attribute
            const detailsElements = tempDiv.querySelectorAll('details');
            detailsElements.forEach(details => {
                details.setAttribute('open', '');
            });
            
            return tempDiv.innerHTML;
        }
        return formattedContent;
    }

    /**
     * Prepare content for printing with themes and styles
     */
    async preparePrintContent(content, notepadName, currentSettings, currentTheme) {
        const isMarkdownFile = notepadName.toLowerCase().endsWith('.md');
        let formattedContent = this.getFormattedContentForPrint(content, isMarkdownFile || this.isPreviewActive);
        
        // Add language labels to code blocks for print
        if (isMarkdownFile || this.isPreviewActive) {
            formattedContent = this.addCopyLangButtonsToCodeBlocks(formattedContent, true);
        }
        
        // Auto-expand details elements for print
        if (!currentSettings.disablePrintExpand) {
            formattedContent = this.expandDetailsForPrint(formattedContent);
        }

        // Load main and preview styles for print
        let mainStyles = '';
        let previewStyles = '';
        let highlightStyles = '';
        try {
            const [mainResponse, previewResponse] = await Promise.all([
                fetch('Assets/styles.css'),
                fetch('Assets/preview-styles.css')
            ]);
            mainStyles = await mainResponse.text();
            previewStyles = await previewResponse.text();
        } catch (error) {
            console.warn('Could not load styles for print:', error);
        }
        
        // Get the current highlight.js theme CSS
        try {
            const highlightThemeLink = document.querySelector('link[data-highlight-theme]');
            if (highlightThemeLink) {
                const highlightResponse = await fetch(highlightThemeLink.href);
                highlightStyles = await highlightResponse.text();
            }
        } catch (error) {
            console.warn('Could not load highlight.js theme for print:', error);
        }

        // Create print-specific styles
        const printStyles = `
            /* Base print layout */
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                line-height: 1.6;
                padding: 2rem;
                color: var(--text-color);
                background-color: var(--bg-color);
                margin: 0;
            }

            /* Ensure proper theme inheritance */
            * {
                color: inherit;
                background-color: inherit;
            }

            @media print {
                /* Force browsers to print background colors */
                body {
                    padding: 1rem;
                    color: var(--text-color) !important;
                    background-color: var(--bg-color) !important;
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* Force all elements to preserve their theme colors */
                *, *::before, *::after {
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* Inject all preview styles into print media */
                ${previewStyles}
            }
        `;

        return {
            formattedContent,
            mainStyles,
            previewStyles,
            highlightStyles,
            printStyles
        };
    }

    /**
     * Update highlight.js theme based on current app theme
     */
    updateHighlightTheme(theme) {
        // Remove any existing highlight.js theme
        const existingTheme = document.querySelector('link[data-highlight-theme]');
        if (existingTheme) {
            existingTheme.remove();
        }
        
        // Determine which theme CSS to load
        const themeCss = theme === 'dark' 
            ? '/css/@highlightjs/github-dark.min.css'
            : '/css/@highlightjs/github.min.css';
        
        // Create and append new theme link
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = themeCss;
        link.setAttribute('data-highlight-theme', theme);
        document.head.appendChild(link);
    }

    /**
     * Initialize markdown parser with syntax highlighting and extensions
     */
    async initializeMarkdown(currentTheme, markdownContent = '', defaultLanguages = ['javascript', 'python', 'css', 'html', 'json']) {
        // Set initial highlight theme based on current theme
        this.updateHighlightTheme(currentTheme);

        // Import hljs once for the entire method
        const { default: hljs } = await import('/js/@highlightjs/highlight.min.js');

        // Detect languages in the markdown content
        const detectedLanguages = new Set();
        const codeBlockRegex = /```([\w-]+)/g;
        let match;
        while ((match = codeBlockRegex.exec(markdownContent)) !== null) {
            detectedLanguages.add(match[1]);
        }

        // Use detected languages or fallback to default languages
        const languagesToLoad = detectedLanguages.size > 0 ? Array.from(detectedLanguages) : defaultLanguages;

        if (languagesToLoad.length > 0) {
            try {
                // Create array of import promises for parallel loading
                const importPromises = languagesToLoad.map(async (lang) => {
                    const langAlias = lang === 'html' ? 'xml' : lang; // Use 'xml' for HTML syntax highlighting
                    try {
                        const module = await import(`/js/@highlightjs/languages/${langAlias}.min.js`);
                        if (module && module.default) {
                            return { lang, module: module.default };
                        }
                    } catch (e) {
                        console.warn(`Language module for ${langAlias} not found or invalid`);
                    }
                    return null;
                });

                // Wait for all imports to complete in parallel
                const results = await Promise.all(importPromises);

                // Register each successfully imported language
                for (const result of results) {
                    if (result) {
                        hljs.registerLanguage(result.lang, result.module);
                        if (this.DEBUG) console.log(`Registered highlight.js language: ${result.lang}`);
                    }
                }
            }
            catch (error) {
                console.warn('Error initializing highlight.js languages:', error);
            }
        }

        // Import and configure marked extensions
        const { markedHighlight } = await import('/js/marked-highlight/index.js');
        const markedExtendedTables = (await import('/js/marked-extended-tables/index.js')).default;
        const markedAlert = (await import('/js/marked-alert/index.js')).default;

        this.marked.use(markedHighlight({
            langPrefix: 'hljs language-',
            highlight(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : '';
                if (language) {
                    return hljs.highlight(code, { language }).value;                    
                }

                // If no valid language, use auto-detection
                return hljs.highlightAuto(code).value;
            }
        }));
        this.marked.use(markedExtendedTables);
        this.marked.use(markedAlert());
        this.marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    /**
     * Dynamically load additional highlight.js languages based on content
     * @param {string} markdownContent - The markdown content to scan for languages
     */
    async loadAdditionalLanguages(markdownContent) {
        // Import hljs to check if we have it initialized
        const { default: hljs } = await import('/js/@highlightjs/highlight.min.js');

        // Detect languages in the new content
        const detectedLanguages = new Set();
        const codeBlockRegex = /```([\w-]+)/g;
        let match;
        while ((match = codeBlockRegex.exec(markdownContent)) !== null) {
            detectedLanguages.add(match[1]);
        }

        // Filter out languages that are already registered
        const languagesToLoad = Array.from(detectedLanguages).filter(lang => {
            return !hljs.getLanguage(lang);
        });

        if (languagesToLoad.length > 0) {
            if (this.DEBUG) console.log('Loading additional languages:', languagesToLoad);
            
            try {
                // Create array of import promises for parallel loading
                const importPromises = languagesToLoad.map(async (lang) => {
                    const langAlias = lang === 'html' ? 'xml' : lang;
                    try {
                        const module = await import(`/js/@highlightjs/languages/${langAlias}.min.js`);
                        if (module && module.default) {
                            return { lang, module: module.default };
                        }
                    } catch (e) {
                        console.warn(`Language module for ${langAlias} not found or invalid`);
                    }
                    return null;
                });

                // Wait for all imports to complete in parallel
                const results = await Promise.all(importPromises);

                // Register each successfully imported language
                for (const result of results) {
                    if (result) {
                        hljs.registerLanguage(result.lang, result.module);
                        if (this.DEBUG) console.log(`Registered additional highlight.js language: ${result.lang}`);
                    }
                }
            } catch (error) {
                console.warn('Error loading additional highlight.js languages:', error);
            }
        }
    }

    /**
     * Render markdown content to the preview pane
     */
    async renderMarkdownPreview(content) {
        // Load any additional languages that might be in the content
        await this.loadAdditionalLanguages(content);
        
        this.previewPane.innerHTML = this.marked.parse(content);
        this.addCopyLangButtonsToCodeBlocks();
    }

    /**
     * Add event listeners for preview functionality
     */
    addEventListeners() {
        this.previewMarkdownBtn.addEventListener('click', () => {
            this.toggleMarkdownPreview(true);
        });
        
        // Handle window resize to switch between mobile and desktop layouts
        window.addEventListener('resize', () => {
            if (this.previewMode === 'split') {
                // Reapply split mode to adjust layout for current screen size
                this.applyPreviewMode(false);
            }
        });
    }
}
