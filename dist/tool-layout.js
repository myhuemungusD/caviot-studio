"use strict";
const toolsSidebar=document.querySelector('.sidebar');
const toolsHeader=document.createElement('div');toolsHeader.className='tools-heading';toolsHeader.appendChild($('mobileSettingsBtn'));document.querySelector('.topbar').prepend(toolsHeader);
const depthControls=document.createElement('div');depthControls.id='selectedFinish';depthControls.append($('depthIn').closest('.big-field'),$('modeRaised').closest('.pill-toggle'));$('designSizing').after(depthControls);
$('addImageLayer').hidden=true;$('openPatterns').hidden=true;
document.querySelector('.top-actions').prepend($('openSTL'));
const outputPanel=document.createElement('section');outputPanel.className='panel output-mode-panel';outputPanel.innerHTML='<div class="panel-label">Output shape</div>';outputPanel.appendChild(document.querySelector('.mode-pills'));toolsSidebar.append(outputPanel,document.querySelector('.template-select-panel'),$('bottomBrandPanel'));
