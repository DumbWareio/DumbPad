/**
 * PreviewManager handles all markdown preview functionality including:
 * - Toggling between edit and preview modes
 * - Rendering markdown content
 * - Managing preview styles and state
 * - Adding copy buttons to code blocks
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
        
        this.isPreviewMode = false;
        this.DEBUG = false;
    }

    /**
     * Get current preview mode state
     */
    getPreviewMode() {
        return this.isPreviewMode;
    }

    /**
     * Set preview mode state
     */
    setPreviewMode(mode) {
        this.isPreviewMode = mode;
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
     * Toggle between edit and preview modes
     */
    async toggleMarkdownPreview(toggle, enable, enableStatusMessage = true) {
        if (toggle) {
            this.isPreviewMode = !this.isPreviewMode;
        } else {
            this.isPreviewMode = enable;
        }
        
        if (this.isPreviewMode) {
            this.inheritEditorStyles(this.previewPane);
            await this.renderMarkdownPreview(this.editor.value);
            this.previewContainer.style.display = 'block';
            this.editorContainer.style.display = 'none';
            this.previewMarkdownBtn.classList.add('active');
            if (enableStatusMessage) {
                this.toaster.show('Markdown Preview On', 'success');
            }
        } else {
            this.previewContainer.style.display = 'none';
            this.editorContainer.style.display = 'block';
            this.previewMarkdownBtn.classList.remove('active');
            this.editor.focus();
            if (enableStatusMessage) {
                this.toaster.show('Markdown Preview Off', 'error');
            }
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
        if (this.isPreviewMode) {
            await this.renderMarkdownPreview(content);
        }
    }

    /**
     * Generate formatted content for printing
     */
    getFormattedContentForPrint(content, isMarkdownFile) {
        if (isMarkdownFile || this.isPreviewMode) {
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
        let formattedContent = this.getFormattedContentForPrint(content, isMarkdownFile || this.isPreviewMode);
        
        // Add language labels to code blocks for print
        if (isMarkdownFile || this.isPreviewMode) {
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
        this.marked.use(markedAlert);
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
     * Add event listeners for preview functionality
     */
    addEventListeners() {
        this.previewMarkdownBtn.addEventListener('click', () => {
            this.toggleMarkdownPreview(true);
        });
    }
}
