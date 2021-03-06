(function() {

    /**
     * After loading the initial content of the page builder, restrict access to all layout components.
     * Only blocks and components inside the element with phpb-content-container attribute are editable.
     */
    window.editor.on('load', function(editor) {
        addThemeBlocks();

        window.languages.forEach(language => {
            if (window.pageBlocks[language] === null) {
                window.pageBlocks[language] = {};
            }
        });

        activateLanguage(window.currentLanguage);
    });

    /**
     * Add all theme blocks to GrapesJS blocks manager.
     */
    function addThemeBlocks() {
        for (let blockSlug in window.themeBlocks) {
            let block = window.themeBlocks[blockSlug];

            // remove whitespace from phpb-block-container elements, otherwise these components will become type=text,
            // resulting in components dropped inside the container jumping to the dropped position - 1
            let $blockHtml = $("<container>").append(block.content);
            $blockHtml.find("[phpb-blocks-container]").each(function() {
                if ($(this).html() !== '' && $(this).html().trim() === '') {
                    $(this).html('');
                }
            });
            window.themeBlocks[blockSlug].content = $blockHtml.html();
            block.content = $blockHtml.html();

            editor.BlockManager.add(blockSlug, block);
        }
    }

    /**
     * Switch pagebuilder to another language variant on changing the language selector.
     */
    $("#language-selector select").on("change", function() {
        let selectedLanguage = $(this).find("option:selected").val();

        window.switchLanguage(selectedLanguage, function() {
            activateLanguage(selectedLanguage);
        });
    });

    /**
     * Activate the given language variant in the pagebuilder.
     *
     * @param newLanguage
     */
    window.activateLanguage = function(newLanguage) {
        window.currentLanguage = newLanguage;

        // reset GrapesJS editor before loading the new language variant
        window.editor.select();
        window.editor.DomComponents.clear();
        window.editor.DomComponents.componentsById = [];
        window.editor.UndoManager.clear();

        // load initial non-editable layout components
        window.editor.setComponents(window.initialComponents);
        denyAccessToLayoutElements(editor.getWrapper());
        let container = editor.getWrapper().find("[phpb-content-container]")[0];
        container.set('custom-name', window.translations['page-content']);

        // reload pageComponents (with phpb-block elements)
        container.components(window.pageComponents);

        // replace phpb-block elements with the server-side rendered version of each block
        replacePlaceholdersForRenderedBlocks(container);

        // apply the stored block settings to the server-side rendered html
        applyBlockAttributesToComponents(container);

        // only allow to edit html blocks
        // (apply after delay, since some styles are not immediately applied and accessible via getComputedStyle)
        setTimeout(function() {
            restrictEditAccess(container);
            window.setWaiting(false);
        }, 500);
    };

    /**
     * Replace phpb-block elements with the server-side rendered version of each block.
     *
     * @param component
     */
    function replacePlaceholdersForRenderedBlocks(component) {
        let newComponent = component;

        // if we encounter a pagebuilder block, replace it with the server-side rendered html
        if (component.get('tagName') === 'phpb-block') {
            let id = component.attributes.attributes.id;
            if (window.pageBlocks[window.currentLanguage][id] !== undefined && window.pageBlocks[window.currentLanguage][id]['html'] !== undefined) {
                newComponent = component.replaceWith(window.pageBlocks[window.currentLanguage][id]['html']);
                window.pageBlocks[window.currentLanguage][id]['html'] = '';
            }
        }

        // replace placeholders inside child components
        newComponent.get('components').each(childComponent => replacePlaceholdersForRenderedBlocks(childComponent));
    }

    /**
     * Function for denying edit access to this component and all children that belong to the layout.
     *
     * @param component
     */
    function denyAccessToLayoutElements(component) {
        if ('phpb-content-container' in component.attributes.attributes) return;

        disableAllEditFunctionality(component);

        // apply restrictions to child components
        component.get('components').each(component => denyAccessToLayoutElements(component));
    }


    /**
     * Component select handler.
     */
    window.editor.on('component:selected', function(component) {
        // if the component has settings, activate settings panel in pagebuilder sidebar
        if (componentHasBlockSettings(component)) {
            $(".gjs-pn-buttons .gjs-pn-btn:nth-of-type(2)").click();
        }
        else if (component.get('type') === '' && componentHasBackground(component)) {
            // on selecting a default component without settings, with editable background, show background styling
            $(".gjs-pn-buttons .gjs-pn-btn:nth-of-type(3)").click();
            if ($("#gjs-sm-position").hasClass("gjs-sm-open")) {
                $("#gjs-sm-position").find(".gjs-sm-title").click();
            }
            if (! $("#gjs-sm-background").hasClass("gjs-sm-open")) {
                $("#gjs-sm-background").find(".gjs-sm-title").click();
            }
        }

        // if component has no settings, add no settings text to settings panel in sidebar
        if (! componentHasBlockSettings(component)) {
            setTimeout(function() {
                $(".gjs-trt-traits").html('<p class="no-settings">' + window.translations['trait-manager']['no-settings'] + '</p>');
            }, 0);
        }

        // only show the toolbar buttons that are applicable
        setTimeout(function() {
            if (! component.attributes.removable) {
                $(".gjs-toolbar .fa-trash-o.gjs-toolbar-item").hide();
            }
            if (! component.attributes.copyable) {
                $(".gjs-toolbar .fa-clone.gjs-toolbar-item").hide();
            }
            if (! component.attributes.draggable) {
                $(".gjs-toolbar .fa-arrows.gjs-toolbar-item").hide();
            }
        }, 0);
    });


    /**
     * Component clone handler.
     */
    window.editor.on('component:clone', function(component) {
        // if the clone is performed by the user, do not copy the block id and style identifier
        if (! isCloningFromScript) {
            if (component.attributes['style-identifier'] !== undefined && component.attributes['style-identifier'] !== '') {
                component.removeClass(component.attributes['style-identifier']);
                delete component.attributes['style-identifier'];
                addUniqueClass(component);
            }
            component.attributes['block-id'] = component.attributes['block-slug'];
        }
    });


    /**
     * Return whether the given component contains a CSS background, that should be editable.
     *
     * @param component
     * @returns {boolean}
     */
    function componentHasBackground(component) {
        let hasBackground = false;

        let componentElement = component.getEl();
        if (componentElement && componentElement.style) {
            let componentStyle = window.getComputedStyle(componentElement);

            ['background', 'background-image', 'background-color'].forEach(property => {
                let value = componentStyle.getPropertyValue(property);
                if (value !== undefined && value !== '' && ! value.includes('none') && ! value.includes('rgba(0, 0, 0, 0)')) {
                    hasBackground = true;
                }
            });
        }

        return hasBackground;
    }

    /**
     * Return whether the given component has settings defined in its block config file.
     *
     * @param component
     * @returns {boolean}
     */
    function componentHasBlockSettings(component) {
        return component.attributes.traits.length > 0;
    }

    /**
     * On dropping a component on the canvas, apply attributes of the container phpb-block element with configuration passed
     * from the server and restrict edit access to editable components.
     */
    window.editor.on('block:drag:stop', function(droppedComponent) {
        // ensure component drop was successful
        if (! droppedComponent) return;

        let parent = droppedComponent.parent();
        applyBlockAttributesToComponents(droppedComponent);
        restrictEditAccess(parent);
    });

    /**
     * Apply the block attributes which are stored in <phpb-block> elements to the top-level html element inside the block.
     * If the block starts with multiple top-level html elements, add a div element wrapping the block's top-level elements.
     *
     * @param component
     */
    function applyBlockAttributesToComponents(component) {
        if (component.attributes.tagName === 'phpb-block') {
            let container = component.parent();
            let clone = cloneComponent(component);

            // since component is a <phpb-block> that should be removed and replaced by its children,
            // the component's parent's child that has the id of the <phpb-block> component needs to be replaced
            let blockRootComponent;
            if (component.attributes.attributes['is-html'] === 'false') {
                container.components().each(function(componentSibling) {
                    if (componentSibling.cid === component.cid) {
                        // replace the <phpb-block> by the actual component
                        // the component is wrapped with a div to allow block styling (via a unique .style-identifier selector)
                        blockRootComponent = component.replaceWith({tagName: 'div'});
                        blockRootComponent.attributes['is-style-wrapper'] = true;
                        clone.components().each(function(componentChild) {
                            blockRootComponent.append(cloneComponent(componentChild));
                        });
                    }
                });
            } else {
                container.components().each(function(componentSibling) {
                    if (componentSibling.cid === component.cid) {
                        // if the <phpb-block> has one direct child, replace it by its only child
                        // else, replace it by a wrapper div to allow block styling (via a unique .style-identifier selector)
                        if (clone.components().length === 1) {
                            blockRootComponent = component.replaceWith(clone.components().models[0].clone());
                        } else {
                            blockRootComponent = component.replaceWith({tagName: 'div'});
                            blockRootComponent.attributes['is-style-wrapper'] = true;
                            clone.components().each(function(componentChild) {
                                blockRootComponent.append(cloneComponent(componentChild));
                            });
                        }
                    }
                });
            }
            component.remove();

            copyAttributes(clone, blockRootComponent, true, false);
            // add all settings of this component to the settings panel in the sidebar
            addSettingsToSidebar(blockRootComponent);
            // recursive call to find and replace <phpb-block> elements of nested blocks (loaded via shortcodes)
            applyBlockAttributesToComponents(blockRootComponent);
        } else {
            component.components().each(function(childComponent) {
                // recursive call to find and replace <phpb-block> elements of nested blocks (loaded via shortcodes)
                applyBlockAttributesToComponents(childComponent);
            });
        }
    }

    /**
     * Get the current setting values for the given component.
     *
     * @param component
     */
    function getCurrentSettingValues(component) {
        // Block settings are stored in window.pageBlocks in a structure starting with each root block (the first ancestor that does not have a dynamic parent itself).
        // So, we need to find the root of the given component and store all block ids along the way, in order to traverse the pageBlocks structure to the settings of the given component.
        // These block ids are only unique in the context of their parent (we can have multiple instances of the same nested block structure), so we call them relative IDs.
        let relativeIds = [];

        // get the root component of the given component (its first ancestor that does not have a dynamic parent itself or the block that is inside a blocks container)
        let rootComponent = component;
        while (rootComponent.parent() &&
            rootComponent.parent().attributes.attributes['phpb-blocks-container'] === undefined &&
            rootComponent.parent().attributes['is-html'] !== 'true' &&
            rootComponent.parent().attributes.attributes['phpb-content-container'] === undefined
        ) {
            if (rootComponent.attributes['block-id'] !== undefined) {
                relativeIds.push(rootComponent.attributes['block-id']);
            }
            rootComponent = rootComponent.parent();
        }
        let rootId = rootComponent.attributes['block-id'];

        // get the component settings by traversing the pageBlocks structure
        let settings = window.pageBlocks[window.currentLanguage][rootId];
        relativeIds.reverse().forEach(function(relativeId) {
            if (settings === undefined || settings.blocks === undefined || settings.blocks[relativeId] === undefined) {
                settings = {};
            } else {
                settings = settings.blocks[relativeId];
            }
        });

        // return the values stored in the current component's settings structure
        let settingsValues = {};
        if (settings !== undefined && settings.settings !== undefined && settings.settings.attributes !== undefined) {
            settingsValues = settings.settings.attributes;
        }
        return settingsValues;
    }

    /**
     * Add all settings from the block's config file to the given component,
     * to allow them to be changed in the settings side panel.
     *
     * @param component
     */
    function addSettingsToSidebar(component) {
        if (window.blockSettings[component.attributes['block-slug']] === undefined) {
            return;
        }
        component.attributes.settings = {};

        let settingValues = getCurrentSettingValues(component);

        // set style identifier class to the block wrapper, if an identifier has been stored during earlier getDataInStorageFormat calls
        if (settingValues['style-identifier'] !== undefined) {
            component.addClass(settingValues['style-identifier']);
        }

        // for each setting add a trait to the settings sidebar panel with the earlier stored or default value
        component.attributes['is-updating'] = true;
        let settings = window.blockSettings[component.attributes['block-slug']];
        settings.forEach(function(setting) {
            let trait = component.addTrait(setting);
            if (settingValues[setting['name']] !== undefined) {
                trait.setTargetValue(settingValues[setting['name']]);
            } else if (setting['default-value'] !== undefined) {
                trait.setTargetValue(setting['default-value']);
            }
        });
        component.attributes['is-updating'] = false;
    }

    /**
     * On updating an attribute (block setting from the settings side panel), refresh dynamic block via Ajax.
     */
    window.editor.on('component:update', function(component) {
        if (window.isLoaded !== true || component.attributes['is-updating'] || component.changed['attributes'] === undefined) {
            return;
        }
        if ($(".gjs-frame").contents().find("#" + component.ccid).length === 0) {
            return;
        }

        // dynamic pagebuilder blocks can depend on data passed by dynamic parent blocks,
        // so we need to update the closest parent which does not have a dynamic parent itself or the block that is inside a blocks container.
        // also keep track of all intermediate block ids, for re-selecting the currently selected component.
        let relativeIds = [];
        let componentToUpdate = component;
        while (componentToUpdate.parent() &&
            componentToUpdate.parent().attributes.attributes['phpb-blocks-container'] === undefined &&
            componentToUpdate.parent().attributes['is-html'] !== 'true' &&
            componentToUpdate.parent().attributes.attributes['phpb-content-container'] === undefined
        ) {
            if (componentToUpdate.attributes['block-id'] !== undefined) {
                relativeIds.push(componentToUpdate.attributes['block-id']);
            }
            componentToUpdate = componentToUpdate.parent();
        }
        component = componentToUpdate;

        component.attributes['is-updating'] = true;
        $(".gjs-frame").contents().find("#" + component.ccid).addClass('gjs-freezed');

        let container = window.editor.getWrapper().find("#" + component.ccid)[0].parent();
        let data = window.getComponentDataInStorageFormat(component);

        // refresh component contents with updated version requested via ajax call
        $.ajax({
            type: "POST",
            url: window.renderBlockUrl,
            data: {
                data: JSON.stringify(data),
                language: window.currentLanguage
            },
            success: function(blockHtml) {
                let blockId = $(blockHtml).attr('block-id');

                // set the block settings for the updated component to the new values
                window.pageBlocks[window.currentLanguage][blockId] = (data.blocks[blockId] === undefined) ? {} : data.blocks[blockId];

                // replace old component for the rendered html returned by the server
                component.replaceWith(blockHtml);
                replacePlaceholdersForRenderedBlocks(container);
                applyBlockAttributesToComponents(container);
                restrictEditAccess(container, false, false);

                // select the component that was selected before the ajax call
                relativeIds.push(blockId);
                let newComponent = findChildViaBlockIdsPath(container, relativeIds.reverse());

                window.editor.select(newComponent);
            },
            error: function() {
                $(".gjs-frame").contents().find("#" + component.ccid).removeClass('gjs-freezed');
                component.attributes['is-updating'] = false;
                window.toastr.error(window.translations['toastr-component-update-failed']);
            }
        });
    });

    /**
     * Traverse the children of the given component via the given path of block IDs
     * and return the component with the last ID from the list.
     *
     * @param component
     * @param blockIds
     * @returns {null|*}
     */
    function findChildViaBlockIdsPath(component, blockIds) {
        if (blockIds.length === 0) {
            return component;
        }

        let result = null;

        component.components().each(function(child) {
            if (child.attributes['block-id'] === blockIds[0]) {
                result = findChildViaBlockIdsPath(child, blockIds.slice(1));
                return false;
            }
        });

        component.components().each(function(child) {
            let childResult = findChildViaBlockIdsPath(child, blockIds);
            if (childResult !== null) {
                result = childResult;
                return false;
            }
        });

        return result;
    }

    /**
     * Clone the given component (while preserving all attributes, like IDs).
     *
     * @param component
     */
    let isCloningFromScript = false;
    window.cloneComponent = function(component) {
        isCloningFromScript = true;

        let clone = component.clone();
        deepCopyAttributes(component, clone);

        isCloningFromScript = false;
        return clone;
    };

    /**
     * Apply the attributes of the given component and its children to each corresponding component of the given clone.
     *
     * @param component
     * @param clone
     */
    function deepCopyAttributes(component, clone) {
        // apply all attributes from component to clone
        copyAttributes(component, clone, false, true);
        // apply attributes from component's children to clone's children
        for (let index = 0; index < component.components().length; index++) {
            let componentChild = component.components().models[index];
            let cloneChild = clone.components().models[index];
            deepCopyAttributes(componentChild, cloneChild);
        }
    }

    /**
     * Apply the attributes of the given component to the given target component.
     *
     * @param component
     * @param targetComponent
     * @param copyGrapesAttributes              whether all GrapesJS component attributes (like permissions) should be copied
     * @param copyHtmlElementAttributes         whether the html element attributes should be copied
     */
    function copyAttributes(component, targetComponent, copyGrapesAttributes, copyHtmlElementAttributes) {
        let componentAttributes = component.attributes.attributes;
        for (let attribute in componentAttributes) {
            if (copyHtmlElementAttributes) {
                targetComponent.attributes.attributes[attribute] = componentAttributes[attribute];
            }
            if (copyGrapesAttributes) {
                targetComponent.attributes[attribute] = componentAttributes[attribute];
            }
        }
    }

    /**
     * Function for only allowing edit access on whitelisted components.
     *
     * @param component
     * @param directlyInsideDynamicBlock
     * @param allowEditableComponents
     */
    function restrictEditAccess(component, directlyInsideDynamicBlock = false, allowEditableComponents = true) {
        disableAllEditFunctionality(component);

        if (component.attributes.attributes['phpb-content-container'] !== undefined) {
            // the content container of the current page can receive other components
            component.set({
                droppable: true,
                hoverable: true,
            });
        } else if (component.attributes['block-slug'] !== undefined) {
            // we just entered a new block, set default permissions
            let permissions = {
                selectable: true,
                hoverable: true,
            };
            if (! directlyInsideDynamicBlock) {
                // the block we entered is not located directly inside a dynamic block, hence this block can be removed, dragged, configured and styled
                permissions = {
                    removable: true,
                    draggable: true,
                    copyable: true,
                    selectable: true,
                    hoverable: true,
                    stylable: true,
                };
                // for styling this particular block, the block needs to have a unique class
                addUniqueClass(component);
            }
            if (component.attributes['is-html'] === 'true') {
                // the block we just entered is an html block,
                // the next layer of child blocks are not directly inside a dynamic block
                directlyInsideDynamicBlock = false;
                // in an html block, editing elements (based on their html tag) is allowed
                allowEditableComponents = true;
            } else {
                // the block we just entered is dynamic,
                // the next layer of child blocks are directly inside a dynamic block
                directlyInsideDynamicBlock = true;
                // in a dynamic block, editing elements (based on their html tag) is not allowed
                allowEditableComponents = false;
                // dynamic blocks do not have text-editable components, so remove text cursors
                component.getEl().setAttribute('data-cursor', 'default');
            }
            component.set(permissions);
        }

        // set editable access based on tags, styling or html class attribute
        if (allowEditableComponents) {
            allowEditBasedOnComponentAttributes(component);

            // if the component is made text-editable, re-add the raw html contents
            // to ensure the text editor does not deal with elements with attributes added by GrapesJS
            if (component.attributes['made-text-editable'] === 'true') {
                component.attributes.attributes['data-raw-content'] = 'true';
                allowEditableComponents = false;
            }
        }

        // apply edit restrictions to child components
        component.get('components').each(component => restrictEditAccess(component, directlyInsideDynamicBlock, allowEditableComponents));
    }

    /**
     * Set the given component's editability based on which tag the component represents,
     * which attributes are set or which styling is applied.
     *
     * @param component
     * @returns {boolean}
     */
    function allowEditBasedOnComponentAttributes(component) {
        let htmlTag = component.get('tagName');

        let textEditableTags = [
            //'div','span', // needed for editable bootstrap alert, but cannot be used since divs (block containers) then cannot be removed
            'h1','h2','h3','h4','h5','h6','h7',
            'img','button',
            'p','small','b','strong','i','em',
            'ul','li','th','td'
        ];

        let settings = {};
        if ('phpb-blocks-container' in component.attributes.attributes) {
            settings.hoverable = true;
            settings.selectable = true;
            settings.droppable = true;
        }

        if (textEditableTags.includes(htmlTag) || 'phpb-editable' in component.attributes.attributes) {
            settings.editable = true;
            component.attributes['made-text-editable'] = 'true';
        }

        if (componentHasBackground(component)) {
            settings.hoverable = true;
            settings.selectable = true;
            settings.stylable = true;
        }

        if (htmlTag === 'a') {
            settings.hoverable = true;
            settings.selectable = true;
            settings.stylable = true;
        }

        if (! $.isEmptyObject(settings)) {
            component.set(settings);
            if (settings.stylable !== undefined && settings.stylable) {
                addUniqueClass(component);
            }
        }
    }

    /**
     * Add a unique class to this component to ensure style only applies to this component instance.
     *
     * @param component
     */
    function addUniqueClass(component) {
        // get component identifier class if one is already added to the component's html when saving the pagebuilder previously
        let componentIdentifier = false;
        component.getClasses().forEach(componentClass => {
            if (componentClass.startsWith('ID') && componentClass.length === 16) {
                componentIdentifier = componentClass;
            }
        });

        if (component.attributes['style-identifier'] === undefined) {
            component.attributes['style-identifier'] = componentIdentifier ? componentIdentifier : generateId();
        }
        component.addClass(component.attributes['style-identifier']);
    }

    /**
     * Disable all edit functionality on the given component.
     *
     * @param component
     */
    function disableAllEditFunctionality(component) {
        component.set({
            removable: false,
            draggable: false,
            droppable: false,
            badgable: false,
            stylable: false,
            highlightable: false,
            copyable: false,
            resizable: false,
            editable: false,
            layerable: false,
            selectable: false,
            hoverable: false
        });
    }

    /**
     * Generate a unique id string.
     *
     * Based on: https://gist.github.com/gordonbrander/2230317
     */
    let counter = 0;
    function generateId() {
        return 'ID' + (Date.now().toString(36)
            + Math.random().toString(36).substr(2, 5) + counter++).toUpperCase();
    }

})();
