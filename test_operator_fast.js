import { OperatorMessageSenderWithResponse } from '../operator/send_and_wait_for_response.js';

(async () => {
  console.log('🔌 Connecting to Operator...');
  const sender = new OperatorMessageSenderWithResponse({
    waitForResponse: false,
    wait: 30,
    preferHome: true
  });
  
  const connected = await sender.connect();
  if (!connected) {
    console.log('❌ Failed to connect');
    return;
  }
  
  console.log('✅ Connected to Operator');
  
  // Check current URL
  const currentUrl = await sender.client.Runtime.evaluate({
    expression: 'window.location.href',
    returnByValue: true
  });
  console.log('📍 Current URL:', currentUrl.result.value);
  
  // Test the fast input method directly
  console.log('🧪 Testing textarea detection and text setting...');
  
  const testMessage = 'TEST MESSAGE - Manual test of fast input';
  
  try {
    // Check textarea availability
    const textareaCheck = await sender.client.Runtime.evaluate({
      expression: `
      (() => {
        const textareas = document.querySelectorAll('textarea');
        const visibleTextareas = Array.from(textareas).filter(ta => 
          ta.getBoundingClientRect().width > 0 && ta.getBoundingClientRect().height > 0
        );
        
        return {
          totalTextareas: textareas.length,
          visibleTextareas: visibleTextareas.length,
          textareaInfo: visibleTextareas.map(ta => ({
            placeholder: ta.placeholder,
            disabled: ta.disabled,
            value: ta.value,
            width: ta.getBoundingClientRect().width,
            height: ta.getBoundingClientRect().height
          }))
        };
      })()
      `,
      returnByValue: true
    });
    
    console.log('📝 Textarea check:', JSON.stringify(textareaCheck.result.value, null, 2));
    
    if (textareaCheck.result.value.visibleTextareas === 0) {
      console.log('❌ No visible textarea found');
      await sender.disconnect();
      return;
    }
    
    // Try to set text
    const setTextResult = await sender.client.Runtime.evaluate({
      expression: `
      (async () => {
        const textarea = Array.from(document.querySelectorAll('textarea'))
          .find(ta => ta.getBoundingClientRect().width > 0);
          
        if (!textarea) return { success: false, error: 'No textarea found' };
        
        // Focus and click
        textarea.focus();
        textarea.click();
        
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        
        // Clear existing content
        nativeInputValueSetter.call(textarea, '');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 100));
        
        // Set test message
        nativeInputValueSetter.call(textarea, '${testMessage}');
        
        // Trigger React events
        const inputEvt = new Event('input', { bubbles: true });
        Object.defineProperty(inputEvt, 'target', { value: textarea });
        textarea.dispatchEvent(inputEvt);
        
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Focus/blur cycle
        textarea.blur();
        await new Promise(r => setTimeout(r, 50));
        textarea.focus();
        
        return { 
          success: true, 
          finalValue: textarea.value,
          valueLength: textarea.value.length
        };
      })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    
    console.log('📤 Text setting result:', setTextResult.result.value);
    
    // Verify the text is actually there after a moment
    await new Promise(r => setTimeout(r, 1000));
    
    const verifyResult = await sender.client.Runtime.evaluate({
      expression: `
      (() => {
        const textarea = Array.from(document.querySelectorAll('textarea'))
          .find(ta => ta.getBoundingClientRect().width > 0);
        return {
          textareaExists: !!textarea,
          currentValue: textarea ? textarea.value : null,
          isEmpty: textarea ? textarea.value.length === 0 : true
        };
      })()
      `,
      returnByValue: true
    });
    
    console.log('🔍 Final verification:', verifyResult.result.value);
    
    if (verifyResult.result.value.currentValue && verifyResult.result.value.currentValue.includes('TEST MESSAGE')) {
      console.log('✅ SUCCESS: Text is visible in Operator textarea');
    } else {
      console.log('❌ FAILURE: Text is not visible in Operator textarea');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await sender.disconnect();
  }
})();