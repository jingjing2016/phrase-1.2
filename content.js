let lastHoveredElement = null;
let analysisDisplayIdCounter = 0; // To give unique IDs to analysis divs if needed

// Track the element currently under the mouse
document.addEventListener('mouseover', (event) => {
  lastHoveredElement = event.target;
});

// Listen for the hotkey
let currentActionBar = null; // Global variable for the action bar

function removeExistingActionBar() {
  if (currentActionBar) {
    currentActionBar.remove();
    currentActionBar = null;
  }
}

function showActionBar(anchorElement, identifiedWordText, clientX, clientY) {
  removeExistingActionBar(); // Remove any existing bar first

  const actionBar = document.createElement('div');
  actionBar.style.position = 'absolute';
  actionBar.style.backgroundColor = '#f0f0f0';
  actionBar.style.border = '1px solid #ccc';
  actionBar.style.padding = '5px';
  actionBar.style.borderRadius = '3px';
  actionBar.style.zIndex = '10000';
  actionBar.style.display = 'flex';
  actionBar.style.gap = '5px';

  for (let i = 0; i < 6; i++) {
    const button = document.createElement('button');
    button.textContent = (i + 1).toString();
    button.dataset.promptIndex = i.toString();
    button.style.padding = '2px 5px';
    button.style.fontSize = '12px';
    button.onclick = () => {
      const promptIndex = parseInt(button.dataset.promptIndex, 10);
      // identifiedWordText and anchorElement are available from the showActionBar scope

      // First, set the active prompt index
      chrome.runtime.sendMessage(
        { action: "setActivePromptIndex", index: promptIndex },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error setting active prompt index:", chrome.runtime.lastError.message);
            displayAnalysis(anchorElement, `Error setting active prompt: ${chrome.runtime.lastError.message}`, true);
            removeExistingActionBar();
            return;
          }
          if (response && response.success) {
            // Index set successfully, now analyze the text
            chrome.runtime.sendMessage(
              { action: "analyzeText", text: identifiedWordText },
              (analysisResponse) => {
                if (chrome.runtime.lastError) {
                  console.error("Error analyzing text:", chrome.runtime.lastError.message);
                  displayAnalysis(anchorElement, `Error analyzing text: ${chrome.runtime.lastError.message}`, true);
                  removeExistingActionBar();
                  return;
                }
                if (analysisResponse) {
                  if (analysisResponse.error) {
                    console.error("Error from background script (analyzeText):", analysisResponse.error);
                    displayAnalysis(anchorElement, `Error: ${analysisResponse.error}`, true);
                  } else if (analysisResponse.analysis) {
                    displayAnalysis(anchorElement, analysisResponse.analysis, false);
                  }
                } else {
                  console.error("No response from background script (analyzeText) or response was undefined.");
                  displayAnalysis(anchorElement, "Error: No response from analysis service.", true);
                }
                removeExistingActionBar(); // Remove bar after analysis attempt
              }
            );
          } else {
            // Failed to set prompt index
            console.error("Failed to set active prompt index.", response ? response.error : "No response");
            displayAnalysis(anchorElement, `Error: Could not set active prompt. ${response ? response.error : ''}`, true);
            removeExistingActionBar();
          }
        }
      );
    };
    actionBar.appendChild(button);
  }

  document.body.appendChild(actionBar);
  currentActionBar = actionBar; // Store reference to the new bar

  // Positioning based on mouse cursor
  let topPosition = window.scrollY + clientY - actionBar.offsetHeight - 5; // Subtract height and a small margin
  actionBar.style.top = topPosition + 'px';
  actionBar.style.left = (window.scrollX + clientX) + 'px';

  // Ensure it's visible if it overflows horizontally
  // This check should happen after initial positioning.
  const barRect = actionBar.getBoundingClientRect();
  if (barRect.right > window.innerWidth) {
      actionBar.style.left = (window.innerWidth - barRect.width - 5) + 'px'; // Adjust left to keep it in view
  }
   if (barRect.left < 0) {
      actionBar.style.left = '5px';
  }

}

function getWordUnderCursor(event) {
  const clientX = event.clientX;
  const clientY = event.clientY;

  try {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (!range) {
      // console.log("caretRangeFromPoint returned null");
      return null;
    }

    if (range.startContainer.nodeType !== Node.TEXT_NODE || range.startContainer.textContent.trim() === '') {
      // console.log("Not a text node or empty text node", range.startContainer);
      return null;
    }

    let textNode = range.startContainer;
    let offset = range.startOffset;
    let text = textNode.textContent;

    let startIndex = offset;
    let endIndex = offset;

    // Iterate backwards for startIndex
    while (startIndex > 0) {
      const char = text[startIndex - 1];
      if (/\s|[.,;:!?()[\]{}"']/.test(char)) { // Word boundary characters
        break;
      }
      startIndex--;
    }

    // Iterate forwards for endIndex
    while (endIndex < text.length) {
      const char = text[endIndex];
      if (/\s|[.,;:!?()[\]{}"']/.test(char)) { // Word boundary characters
        break;
      }
      endIndex++;
    }

    let word = text.substring(startIndex, endIndex);

    if (!word || word.trim() === '') {
        // console.log("Extracted word is empty");
        return null;
    }

    return { word: word, anchorElement: textNode.parentElement || lastHoveredElement };

  } catch (e) {
    console.error("Error in getWordUnderCursor:", e);
    return null;
  }
}


document.addEventListener('keydown', (event) => {
  if (event.altKey && event.key === 'a') {
    event.preventDefault(); // Prevent any default browser action for 'alt+a'
    removeExistingActionBar(); // Remove action bar if Alt+A is used

    if (lastHoveredElement) {
      const textContent = lastHoveredElement.textContent?.trim();

      if (textContent) {
        // console.log("Hotkey pressed. Text to analyze:", textContent); // Optional: original console log
        const originalElementForAnalysis = lastHoveredElement;

        chrome.runtime.sendMessage({ action: "analyzeText", text: textContent }, (response) => {
          if (chrome.runtime.lastError) {
            // Handle errors from sending the message (e.g., if background script isn't ready)
            const LCRmessage = `Failed to communicate with the extension's background script: ${chrome.runtime.lastError.message}. If the extension was just installed or updated, try reloading the page.`;
            console.error("Error sending message to background script:", LCRmessage);
            displayAnalysis(originalElementForAnalysis, `Error: ${LCRmessage}`, true); // Enhanced message
            return;
          }

          if (response) {
            if (response.error) {
              console.error("Error from background script:", response.error);
              displayAnalysis(originalElementForAnalysis, `Error: ${response.error}`, true);
            } else if (response.analysis) {
              // console.log("Analysis received:", response.analysis); // Optional: original console log
              displayAnalysis(originalElementForAnalysis, response.analysis, false);
            }
          } else {
            // This case might occur if the background script doesn't send a response
            // or if it was closed before responding.
            console.error("No response from background script or response was undefined.");
            displayAnalysis(originalElementForAnalysis, "Error: No response from analysis service.", true);
          }
        });
      } else {
        // console.log("Hotkey pressed, but no text content found in the hovered element."); // Optional: original console log
      }
    } else {
      // console.log("Hotkey pressed, but no element was hovered."); // Optional: original console log
    }
  } else if (event.altKey && event.key === 'z') {
    event.preventDefault();
    let identifiedWordText = null;
    let anchorElementForBar = null;
    const cursorX = event.clientX;
    const cursorY = event.clientY;

    const wordInfo = getWordUnderCursor(event);

    if (wordInfo && wordInfo.word) {
      identifiedWordText = wordInfo.word;
      anchorElementForBar = wordInfo.anchorElement;
      console.log("Alt+Z (caret). Word:", identifiedWordText, "Anchor:", anchorElementForBar);
    } else {
      // Fallback to lastHoveredElement
      if (lastHoveredElement) {
        identifiedWordText = lastHoveredElement.textContent?.trim();
        anchorElementForBar = lastHoveredElement;
        console.log("Alt+Z (fallback). Text:", identifiedWordText, "Anchor:", anchorElementForBar);
      }
    }

    console.log('Alt+Z pressed. Mouse X:', cursorX, 'Mouse Y:', cursorY);

    if (identifiedWordText && anchorElementForBar) {
      showActionBar(anchorElementForBar, identifiedWordText, cursorX, cursorY);
    } else {
      console.log("Alt+Z pressed, but no text content or anchor element could be determined.");
      removeExistingActionBar();
    }
  }
});


// Add a click listener to the document to remove the action bar if clicking outside
document.addEventListener('click', (event) => {
  if (currentActionBar && !currentActionBar.contains(event.target)) {
    // Check if the click was on an element that might trigger the bar (e.g. lastHoveredElement)
    // This is tricky because the click might be on a new element.
    // For now, any click outside an existing action bar will remove it.
    // We also need to ensure that clicking a button *inside* the action bar doesn't immediately remove it
    // before its own click handler can run. The `!currentActionBar.contains(event.target)` handles this.

    // If Alt+Z was just pressed to show the bar, lastHoveredElement would be event.target.
    // The condition `!currentActionBar.contains(event.target)` is the primary check
    // for closing the bar. If the click is outside, we should close it.
    removeExistingActionBar();
  }
}, true); // Use capture phase to potentially intercept clicks that might otherwise be handled by other listeners.

function displayAnalysis(originalElement, analysisText, isError) {
  if (!originalElement || !document.body.contains(originalElement)) {
    console.warn("Original element for analysis is no longer in the DOM. Cannot display analysis.");
    // Optionally, show a general notification if the original element is gone.
    alert("Analysis result: " + analysisText);
    return;
  }

  const analysisDiv = document.createElement('div');
  analysisDisplayIdCounter++;
  const uniqueId = `text_analyzer_ai_helper_result_${analysisDisplayIdCounter}`;
  analysisDiv.id = uniqueId;
  analysisDiv.style.marginTop = '5px';
  analysisDiv.style.padding = '8px';
  analysisDiv.style.border = '1px solid #ddd';
  analysisDiv.style.backgroundColor = '#f9f9f9';
  analysisDiv.style.fontSize = '0.9em';
  analysisDiv.style.fontFamily = 'sans-serif';
  analysisDiv.style.color = isError ? 'red' : '#333';
  analysisDiv.style.textAlign = 'left';
  analysisDiv.style.whiteSpace = 'pre-wrap';

  analysisDiv.textContent = analysisText;

  originalElement.parentNode.insertBefore(analysisDiv, originalElement.nextSibling);

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close Analysis';
  closeButton.style.display = 'block';
  closeButton.style.marginTop = '5px';
  closeButton.style.fontSize = '0.8em';
  closeButton.onclick = () => {
    analysisDiv.remove();
  };
  analysisDiv.appendChild(closeButton);
}

// console.log("Text Analyzer AI Helper content script loaded."); // Optional: original final console log
