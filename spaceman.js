(function() {
    let currentSpacemanInstance = null;
    let currentStyleTag = null;

    // Expose the main function to the window object
    window.initWebuddy = function(config) {
        // --- Cleanup previous instance if it exists ---
        if (currentSpacemanInstance) {
            currentSpacemanInstance.destroy();
        }
        if (currentStyleTag && currentStyleTag.parentNode) {
            currentStyleTag.parentNode.removeChild(currentStyleTag);
        }

        // --- Default settings if not provided in config ---
        const settings = {
            character: config.character || { up: 'red', down: 'green', left: 'blue', right: 'yellow' },
            welcome_messages: config.welcome_messages || [],
            dialogue: config.dialogue || { 'default': ["Hello!", "I'm your Webuddy."] },
            automations: config.automations || [],
            frequency: config.frequency || 20,
            portalColor: config.portalColor || 'rgba(0, 246, 255, 0.5)',
            speechBubble: config.speechBubble || {
                backgroundColor: 'rgba(10, 20, 30, 0.85)',
                textColor: '#E0E0E0',
                borderColor: 'rgba(0, 246, 255, 0.5)'
            },
            idleSpeed: 2,
            moveInterval: 50,
            animationSpeed: config.animationSpeed || 200,
            directionChangeInterval: 2500,
            messageCooldown: 5000,
            previewMode: config.previewMode || false,
            previewElement: config.previewElement
        };
        
        let currentDialogue = [];
        let welcomeQueue = [];
        const WELCOME_SESSION_KEY = 'webuddy_welcome_complete';

        function normalizeUrl(url) {
            try {
                const urlObj = new URL(url);
                let pathname = urlObj.pathname;
                // remove trailing slash if not root
                if (pathname.length > 1 && pathname.endsWith('/')) {
                    pathname = pathname.slice(0, -1);
                }
                return `${urlObj.hostname}${pathname}`;
            } catch (e) {
                console.warn("Could not normalize URL:", url);
                return url; // return original on failure
            }
        }

        function getDialogueForCurrentPage() {
            if (settings.previewMode) {
                if (typeof settings.dialogue === 'object' && settings.dialogue !== null && !Array.isArray(settings.dialogue)) {
                    return Object.values(settings.dialogue).flat();
                }
                return Array.isArray(settings.dialogue) ? settings.dialogue : [];
            }

            if (Array.isArray(settings.dialogue)) { // Backwards compatibility
                return settings.dialogue;
            }

            if (typeof settings.dialogue !== 'object' || settings.dialogue === null) {
                return [];
            }
            
            const currentUrl = window.location.href;
            const normalizedCurrentUrl = normalizeUrl(currentUrl);

            const matchingKey = Object.keys(settings.dialogue).find(pageUrl => normalizeUrl(pageUrl) === normalizedCurrentUrl);

            const pageDialogue = matchingKey ? settings.dialogue[matchingKey] : [];
            const defaultDialogue = settings.dialogue['default'] || [];

            const combined = [...pageDialogue, ...defaultDialogue];
            return combined.length > 0 ? combined : ["Welcome!"];
        }
        
        // --- Create and Inject DOM Elements ---
        const parentElement = settings.previewMode && settings.previewElement ? settings.previewElement : document.body;

        if (!parentElement) {
            console.error("Webuddy cannot be initialized because the target element is not found.");
            return;
        }
        
        const spaceman = document.createElement('div');
        spaceman.id = 'spaceman';
        
        const speechBubble = document.createElement('div');
        speechBubble.className = 'speech-bubble';

        const portal = document.createElement('div');
        portal.className = 'portal';

        spaceman.appendChild(speechBubble);
        spaceman.appendChild(portal);
        parentElement.appendChild(spaceman);

        injectCSS();

        // --- State Management ---
        let idle_currentTop = window.scrollY + window.innerHeight / 2;
        let idle_currentLeftPercent = 50;
        let currentIdleDirection = 'right';
        let isTeleporting = false;
        let isMessageOnCooldown = false;
        let animationFrame = 1; // 1 or 2 for animation
        
        let idleMoveTimer = null;
        let directionChangeTimer = null;
        let messageTimer = null;
        let idleMessageTimer = null;
        let animationTimer = null;
        let allTimers = [];
        const activeHoverTimeouts = new Map();
        let inactivityTimer = null;

        function destroy() {
            // Clear all timers
            [idleMoveTimer, directionChangeTimer, messageTimer, idleMessageTimer, animationTimer, inactivityTimer].forEach(clearTimeout);
            allTimers.forEach(clearTimeout);
            
            // Remove event listeners
            window.removeEventListener('scroll', handleScrollActivity);
            ['mousemove', 'scroll', 'keydown'].forEach(evt => document.removeEventListener(evt, resetInactivityTimer));

            // Remove the element from the DOM
            if (spaceman.parentNode) {
                spaceman.parentNode.removeChild(spaceman);
            }
        }
        currentSpacemanInstance = { destroy };

        // --- Core Logic ---
        function showMessage(text, overrideCooldown = false) {
            if (isMessageOnCooldown && !overrideCooldown) return;

            if (messageTimer) clearTimeout(messageTimer);
            isMessageOnCooldown = true;

            speechBubble.innerText = text;
            speechBubble.style.opacity = '1';
            speechBubble.style.transform = 'translate(-50%, 0) scale(1)';

            const displayTime = Math.max(2000, text.split(' ').length * 350);
            messageTimer = setTimeout(() => {
                speechBubble.style.opacity = '0';
                speechBubble.style.transform = 'translate(-50%, -10px) scale(0.95)';
                setTimeout(() => { isMessageOnCooldown = false; }, settings.messageCooldown);
            }, displayTime);
            allTimers.push(messageTimer);
        }
        
        function getBounds() {
            if (settings.previewMode) {
                const rect = parentElement.getBoundingClientRect();
                return {
                    top: rect.top,
                    left: rect.left,
                    width: parentElement.clientWidth,
                    height: parentElement.clientHeight,
                    isFixed: false
                };
            } else {
                return {
                    top: 0,
                    left: 0,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    isFixed: true
                };
            }
        }

        function moveSpaceman() {
            if (isTeleporting) return;
            
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const spacemanHeight = spaceman.offsetHeight || 50;
            const verticalBuffer = 150;
            const horizontalBufferPx = 110;

            const viewTop = window.scrollY + verticalBuffer;
            const viewBottom = window.scrollY + screenHeight - spacemanHeight - verticalBuffer;
            const minXPercent = (horizontalBufferPx / screenWidth) * 100;
            const maxXPercent = 100 - minXPercent;

            switch (currentIdleDirection) {
                case 'up': idle_currentTop -= settings.idleSpeed; break;
                case 'down': idle_currentTop += settings.idleSpeed; break;
                case 'left': idle_currentLeftPercent -= (settings.idleSpeed / screenWidth) * 100; break;
                case 'right': idle_currentLeftPercent += (settings.idleSpeed / screenWidth) * 100; break;
            }

            if (idle_currentTop < viewTop) { idle_currentTop = viewTop; currentIdleDirection = 'down'; }
            if (idle_currentTop > viewBottom) { idle_currentTop = viewBottom; currentIdleDirection = 'up'; }
            if (idle_currentLeftPercent < minXPercent) { idle_currentLeftPercent = minXPercent; currentIdleDirection = 'right'; }
            if (idle_currentLeftPercent > maxXPercent) { idle_currentLeftPercent = maxXPercent; currentIdleDirection = 'left'; }
            
            spaceman.style.top = `${idle_currentTop}px`;
            spaceman.style.left = `${idle_currentLeftPercent}%`;
        }
        
        function updateCharacterLook() {
            let directionToDraw = currentIdleDirection;
            const animDirection = `${currentIdleDirection}-${animationFrame}`;

            // Use animation frame if it exists, otherwise default to base direction image
            if (settings.character[animDirection]) {
                directionToDraw = animDirection;
            } else {
                // Reset frame if animation doesn't exist for this direction
                animationFrame = 1;
            }
            
            const directionImage = settings.character[directionToDraw];

            if (directionImage) {
                 if(directionImage.startsWith('http') || directionImage.startsWith('/') || directionImage.startsWith('data:')) {
                     spaceman.style.backgroundImage = `url('${directionImage}')`;
                     spaceman.style.backgroundColor = 'transparent';
                     spaceman.style.boxShadow = 'none';
                     spaceman.style.borderRadius = '0';
                 } else {
                     spaceman.style.backgroundImage = 'none';
                     spaceman.style.backgroundColor = directionImage;
                     spaceman.style.boxShadow = `0 0 15px ${settings.portalColor}, 0 0 25px ${settings.portalColor}`;
                     spaceman.style.borderRadius = '50%';
                 }
            }
        }

        function changeIdleDirection() {
            const directions = ['up', 'down', 'left', 'right'];
            let newDirection = directions[Math.floor(Math.random() * directions.length)];
            
            const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
            if (newDirection === opposites[currentIdleDirection]) {
                newDirection = directions[Math.floor(Math.random() * directions.length)];
            }
            currentIdleDirection = newDirection;
            updateCharacterLook();
        }

        function startIdleWalk() {
            stopIdleWalk();
            idleMoveTimer = setInterval(moveSpaceman, settings.moveInterval);
            directionChangeTimer = setInterval(changeIdleDirection, settings.directionChangeInterval);
            animationTimer = setInterval(() => {
                // Only animate if the second frame for the current direction exists
                if (settings.character[`${currentIdleDirection}-2`]) {
                    animationFrame = animationFrame === 1 ? 2 : 1;
                    updateCharacterLook();
                }
            }, settings.animationSpeed);
            allTimers.push(idleMoveTimer, directionChangeTimer, animationTimer);
        }

        function stopIdleWalk() {
            clearInterval(idleMoveTimer);
            clearInterval(directionChangeTimer);
            clearInterval(animationTimer);
            animationFrame = 1; // Reset to default frame
            updateCharacterLook(); // Ensure character is on frame 1
        }
        
        function handleScrollActivity() {
            if (settings.previewMode) return;
            if (isTeleporting) return;

            resetIdleMessageTimer();

            const spacemanHeight = spaceman.offsetHeight || 50;
            const isOutOfView = (idle_currentTop + spacemanHeight) < window.scrollY || idle_currentTop > (window.scrollY + window.innerHeight);

            if (isOutOfView) {
                isTeleporting = true;
                stopIdleWalk();

                spaceman.classList.add('teleporting');
                
                spaceman.style.opacity = '0';
                spaceman.style.transform = 'translateX(-50%) scale(0)';
                
                setTimeout(() => {
                    const screenHeight = window.innerHeight;
                    const screenWidth = window.innerWidth;
                    const verticalBuffer = 150;
                    const horizontalBufferPx = 110;

                    const viewTop = window.scrollY + verticalBuffer;
                    const viewBottom = window.scrollY + screenHeight - spacemanHeight - verticalBuffer;
                    const minXPercent = (horizontalBufferPx / screenWidth) * 100;
                    const maxXPercent = 100 - minXPercent;

                    idle_currentTop = Math.random() * (viewBottom - viewTop) + viewTop;
                    idle_currentLeftPercent = Math.random() * (maxXPercent - minXPercent) + minXPercent;
                    
                    spaceman.style.transition = 'none';
                    spaceman.style.top = `${idle_currentTop}px`;
                    spaceman.style.left = `${idle_currentLeftPercent}%`;
                    void spaceman.offsetWidth;

                    spaceman.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                    
                    setTimeout(() => {
                        spaceman.style.opacity = '1';
                        spaceman.style.transform = 'translateX(-50%) scale(1)';
                        setTimeout(() => {
                            spaceman.classList.remove('teleporting');
                            isTeleporting = false;
                            startIdleWalk();
                        }, 400);
                    }, 50);
                }, 400);
            }
        }

        function showIdleMessage() {
            // Prioritize Welcome Queue
            if (welcomeQueue.length > 0) {
                const nextMessage = welcomeQueue.shift();
                showMessage(nextMessage, true); // Override cooldown for welcome sequence

                if (welcomeQueue.length === 0) {
                    // Sequence finished, mark as complete for this session
                    sessionStorage.setItem(WELCOME_SESSION_KEY, 'true');
                }
                resetIdleMessageTimer();
                return; // Don't show a random message yet
            }

            if (currentDialogue.length === 0) return;
            const message = currentDialogue[Math.floor(Math.random() * currentDialogue.length)];
                showMessage(message);
            resetIdleMessageTimer();
        }

        function resetIdleMessageTimer() {
            if (idleMessageTimer) clearTimeout(idleMessageTimer);
            const interval = settings.frequency * 1000;
            idleMessageTimer = setTimeout(showIdleMessage, interval);
            allTimers.push(idleMessageTimer);
        }

        function initializeWelcomeSequence() {
            const welcomeSeen = sessionStorage.getItem(WELCOME_SESSION_KEY);
            if (!welcomeSeen && settings.welcome_messages.length > 0) {
                welcomeQueue = [...settings.welcome_messages];
                
                const showNextWelcome = () => {
                    if (welcomeQueue.length > 0) {
                        const nextMsg = welcomeQueue.shift();
                        showMessage(nextMsg, true); // Override cooldown for welcome sequence
                        setTimeout(showNextWelcome, 4000); // 4s delay between welcome messages
                    } else {
                        sessionStorage.setItem(WELCOME_SESSION_KEY, 'true');
                        resetIdleMessageTimer(); // Start random messages after welcome sequence
                    }
                };
                setTimeout(showNextWelcome, 2000); // Initial delay before first welcome message
            } else {
                // If no welcome messages, start random dialogue immediately.
                resetIdleMessageTimer();
            }
        }

        function initializeAutomations() {
            settings.automations.forEach(automation => {
                if (automation.triggerType === 'time_on_page') {
                    const timer = setTimeout(() => {
                        showMessage(automation.message);
                    }, (automation.config.seconds || 30) * 1000);
                    allTimers.push(timer);

                } else if (automation.triggerType === 'element_hover') {
                    try {
                        const elements = document.querySelectorAll(automation.config.selector);
                        if (elements.length > 0) {
                            elements.forEach(el => {
                                el.addEventListener('mouseenter', () => {
                                    const now = Date.now();
                                    const lastHover = activeHoverTimeouts.get(automation.config.selector) || 0;
                                    // 60 second cooldown per-selector to prevent spam
                                    if (now - lastHover > 60000) {
                                        showMessage(automation.message);
                                        activeHoverTimeouts.set(automation.config.selector, now);
                                    }
                                });
                            });
                        } else {
                            if(settings.previewMode) console.warn(`Automation Warning: CSS Selector "${automation.config.selector}" did not find any elements.`);
                        }
                    } catch (e) {
                         if(settings.previewMode) console.error(`Automation Error: Invalid CSS Selector "${automation.config.selector}"`, e);
                    }
                } else if (automation.triggerType === 'inactivity') {
                    // Only set one inactivity timer for the first-defined automation of this type
                    if (!inactivityTimer) {
                         resetInactivityTimer(automation);
                    }
                }
            });
        }

        function resetInactivityTimer(automation) {
            if (!automation) return;
            if (inactivityTimer) clearTimeout(inactivityTimer);

            inactivityTimer = setTimeout(() => {
                showMessage(automation.message);
                // Don't restart the inactivity timer after it fires once.
            }, (automation.config.seconds || 60) * 1000);
            
            ['mousemove', 'scroll', 'keydown'].forEach(evt => {
                document.addEventListener(evt, () => resetInactivityTimer(automation), { once: true });
            });
        }

        // --- Init ---
        currentDialogue = getDialogueForCurrentPage();
        initializeWelcomeSequence();
        initializeAutomations();
        startIdleWalk();
        resetIdleMessageTimer();
        
        // Initial message logic
        if (welcomeQueue.length > 0) {
            // Start with the first welcome message if available
            setTimeout(() => showIdleMessage(), 1000);
        } else if (currentDialogue.length > 0) {
            // Otherwise, show the first random message
            setTimeout(() => showMessage(currentDialogue[0], true), 1000);
        }

        // Listen for scroll activity to handle teleporting
        if (!settings.previewMode) {
             window.addEventListener('scroll', handleScrollActivity);
        }

        // --- CSS Injection ---
        function injectCSS() {
            const style = document.createElement('style');
            style.textContent = `
                #spaceman {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 50px;
                    height: 50px;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    z-index: 9999;
                    will-change: top, left, transform, opacity;
                    transition: background-color 0.3s, opacity 0.4s ease-out, transform 0.4s ease-out;
                    transform: translateX(-50%) scale(1);
                }
                #spaceman.teleporting {
                    transition: opacity 0.3s ease-in, transform 0.3s ease-in;
                }
                .speech-bubble {
                    position: absolute;
                    bottom: 110%;
                    left: 50%;
                    transform: translate(-50%, -10px) scale(0.95);
                    background-color: ${settings.speechBubble.backgroundColor};
                    color: ${settings.speechBubble.textColor};
                    padding: 12px 18px;
                    border-radius: 12px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    font-size: 14px;
                    line-height: 1.4;
                    max-width: 250px;
                    text-align: center;
                    opacity: 0;
                    transition: opacity 0.3s ease, transform 0.3s ease;
                    pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    border: 1px solid ${settings.speechBubble.borderColor};
                    white-space: normal;
                }
                .speech-bubble::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    border-width: 8px;
                    border-style: solid;
                    border-color: ${settings.speechBubble.backgroundColor} transparent transparent transparent;
                }
                .portal {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    background-color: ${settings.portalColor};
                    transform: translate(-50%, -50%) scale(0);
                    opacity: 0;
                    transition: transform 0.5s ease-in-out, opacity 0.5s ease-in-out;
                    z-index: -1;
                }
                #spaceman.teleporting .portal {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1.5);
                    animation: portal-pulse 2s infinite;
                }
    
                @keyframes portal-pulse {
                    0% { box-shadow: 0 0 15px 5px ${settings.portalColor}, 0 0 5px 2px #fff inset; }
                    50% { box-shadow: 0 0 30px 10px ${settings.portalColor}, 0 0 10px 4px #fff inset; }
                    100% { box-shadow: 0 0 15px 5px ${settings.portalColor}, 0 0 5px 2px #fff inset; }
                }
            `;
            document.head.appendChild(style);
            currentStyleTag = style;
        }
    };

    // Automatically initialize on a user's site if config exists.
    document.addEventListener('DOMContentLoaded', () => {
        if (window.spacemanConfig) {
             window.initWebuddy(window.spacemanConfig);
        }
    });
})(); 