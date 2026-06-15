
import PropTypes from 'prop-types';
import React, { useState, useCallback } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import styles from './chat.css';
import chatIcon from './icon--chat.svg';
import ChatComponent from './chat.jsx';

const ExpandableChat = props => {
    const [expanded, setExpanded] = useState(true);
    const [dimensions, setDimensions] = useState({ width: 325, height: 500, left: 328, bottom: 16, opacity: 1 });
    const [lastPosition, setLastPosition] = useState(null);
    const [resizingDirection, setResizingDirection] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isHoveringDock, setIsHoveringDock] = useState(false); // [NEW] Track dock zone hover
    const [isVisible, setIsVisible] = useState(true); // Track if component should be visible
    const [noTransition, setNoTransition] = useState(false); // Disable transitions during reset
    const [hasBeenDocked, setHasBeenDocked] = useState(false);

    // Track if it has ever been docked
    React.useEffect(() => {
        if (props.chatModalVisible) {
            setHasBeenDocked(true);
        }
    }, [props.chatModalVisible]);

    // Watch for undock position updates from GUI
    React.useLayoutEffect(() => {
        if (props.undockPosition) {
            setExpanded(true);
            const initialLeft = props.undockPosition.left;
            let initialBottom = props.undockPosition.bottom;

            if (props.undockPosition.mouseY && props.undockPosition.offsetY) {
                const headerTop = props.undockPosition.mouseY - props.undockPosition.offsetY;
                initialBottom = window.innerHeight - (headerTop + dimensions.height);
            }

            setDimensions(prev => ({
                ...prev,
                left: initialLeft,
                bottom: initialBottom
            }));

            // [NEW] Immediately start dragging if mouse coordinates are provided
            if (props.undockPosition.mouseX && props.undockPosition.mouseY) {
                const startX = props.undockPosition.mouseX;
                const startY = props.undockPosition.mouseY;
                const startLeft = initialLeft;
                const startBottom = initialBottom;

                // Avoid immediate re-docking logic unless mouse is released
                setIsDragging(true);

                const doMove = moveEvent => {
                    // Match sidebar width for docking zone
                    if (moveEvent.clientX < 50) {
                        setIsHoveringDock(true);
                    } else {
                        setIsHoveringDock(false);
                    }

                    const newLeft = startLeft + (moveEvent.clientX - startX);
                    const newBottom = startBottom + (startY - moveEvent.clientY);

                    setDimensions(prev => ({
                        ...prev,
                        left: newLeft,
                        bottom: newBottom
                    }));
                };

                const stopMoveHandler = (upEvent) => {
                    setIsDragging(false);
                    setIsHoveringDock(false);

                    if (upEvent.clientX < 50 && props.onDock) {
                        props.onDock();
                        setExpanded(false);
                    }

                    document.removeEventListener('mousemove', doMove);
                    document.removeEventListener('mouseup', stopMoveHandler);
                };

                document.addEventListener('mousemove', doMove);
                document.addEventListener('mouseup', stopMoveHandler);
            }
        }
    }, [props.undockPosition]);

    // Reset to initial state when sidebar closes
    React.useLayoutEffect(() => {
        // Skip reset if undocking is happening
        if (!props.chatModalVisible && !props.undockPosition) {
            // Disable transitions and hide component
            setNoTransition(true);
            setIsVisible(false);

            // Reset position immediately
            setExpanded(false);
            setLastPosition(null);
            setDimensions({
                width: 325,
                height: 500,
                left: 328,
                bottom: 16,
                opacity: 0
            });

            // Show and fade in at new position with transitions re-enabled
            setTimeout(() => {
                setIsVisible(true);
                setNoTransition(false); // Re-enable transitions for fade
                setTimeout(() => {
                    setDimensions(prev => ({
                        ...prev,
                        opacity: 1
                    }));
                }, 20);
            }, 20);
        }
    }, [props.chatModalVisible, props.undockPosition]);

    const toggleChat = () => {
        if (expanded) {
            // Save current position before collapsing
            setLastPosition({ left: dimensions.left, bottom: dimensions.bottom });
            // Reset to initial position when collapsing
            setDimensions(prev => ({
                ...prev,
                left: 328,
                bottom: 16
            }));
            setExpanded(false);
        } else {
            // If it was previously docked in the sidebar (and not manually undocked),
            // restore it to the sidebar mode.
            if (hasBeenDocked && !props.undockPosition && props.onDock) {
                props.onDock();
                return;
            }

            // Restore last position when expanding
            if (lastPosition) {
                setDimensions(prev => ({
                    ...prev,
                    left: lastPosition.left,
                    bottom: lastPosition.bottom
                }));
            }
            setExpanded(true);
        }
    };

    const startResize = useCallback((direction) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingDirection(direction);
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = dimensions.width;
        const startHeight = dimensions.height;
        const startLeft = dimensions.left;
        const startBottom = dimensions.bottom;

        if (direction === 'top') document.body.style.cursor = 'n-resize';
        if (direction === 'right') document.body.style.cursor = 'e-resize';
        if (direction === 'left') document.body.style.cursor = 'w-resize';
        if (direction === 'bottom') document.body.style.cursor = 's-resize';
        if (direction === 'corner-tr') document.body.style.cursor = 'ne-resize';
        if (direction === 'corner-tl') document.body.style.cursor = 'nw-resize';
        if (direction === 'corner-br') document.body.style.cursor = 'se-resize';
        if (direction === 'corner-bl') document.body.style.cursor = 'sw-resize';

        const doDrag = dragEvent => {
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newBottom = startBottom;
            const deltaX = dragEvent.clientX - startX;
            const deltaY = startY - dragEvent.clientY;

            // Right (includes corner-tr and corner-br)
            if (direction === 'right' || direction === 'corner-tr' || direction === 'corner-br') {
                newWidth = Math.max(325, Math.min(480, startWidth + deltaX));
            }

            // Left (includes corner-tl and corner-bl)
            if (direction === 'left' || direction === 'corner-tl' || direction === 'corner-bl') {
                const proposedWidth = startWidth - deltaX;
                newWidth = Math.max(325, Math.min(480, proposedWidth));
                const actualWidthChange = startWidth - newWidth;
                newLeft = startLeft + actualWidthChange;
            }

            // Top (includes corner-tr and corner-tl)
            if (direction === 'top' || direction === 'corner-tr' || direction === 'corner-tl') {
                const windowHeight = window.innerHeight;
                const menuBarHeight = 64;
                const maxAllowedHeightByMenu = windowHeight - menuBarHeight - startBottom;

                // Height must be between 400 and 800, but also not overlap menu bar
                const maxHeight = Math.min(800, maxAllowedHeightByMenu);
                newHeight = Math.max(400, Math.min(maxHeight, startHeight + deltaY));
            }

            // Bottom (includes corner-br and corner-bl)
            if (direction === 'bottom' || direction === 'corner-br' || direction === 'corner-bl') {
                const dragDownAmount = dragEvent.clientY - startY;
                const proposedHeight = startHeight + dragDownAmount;

                // Clamp height between 400 and 800
                newHeight = Math.max(400, Math.min(800, proposedHeight));

                // Position must also compensate for height change
                const actualHeightChange = startHeight - newHeight;
                newBottom = startBottom + actualHeightChange;
            }

            setDimensions({
                width: newWidth,
                height: newHeight,
                left: newLeft,
                bottom: newBottom
            });
        };

        const stopDrag = () => {
            setResizingDirection(null);
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [dimensions]);

    const startMove = useCallback((e) => {
        if (e.target.closest('button')) return;

        e.preventDefault();
        setIsDragging(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = dimensions.left;
        const startBottom = dimensions.bottom;

        const doMove = moveEvent => {
            // [UPDATED] Update hover state based on position
            if (moveEvent.clientX < 50) {
                setIsHoveringDock(true);
            } else {
                setIsHoveringDock(false);
            }

            const newLeft = startLeft + (moveEvent.clientX - startX);
            let newBottom = startBottom + (startY - moveEvent.clientY);

            // Prevent overlapping with menu bar (48px height)
            // Calculate max bottom based on window height and menu bar
            const windowHeight = window.innerHeight;
            const menuBarHeight = 64; // 3rem
            const panelHeight = dimensions.height;
            const maxBottom = windowHeight - menuBarHeight - panelHeight;

            // Constrain bottom position
            if (newBottom > maxBottom) {
                newBottom = maxBottom;
            }

            // Prevent going below screen
            if (newBottom < 0) {
                newBottom = 0;
            }

            setDimensions(prev => ({
                ...prev,
                left: newLeft,
                bottom: newBottom
            }));
        };

        const stopMove = () => {
            // ...
        };

        // Revised stopMove with event access
        const stopMoveHandler = (upEvent) => {
            setIsDragging(false);
            setIsHoveringDock(false); // Reset visualization

            if (upEvent.clientX < 50 && props.onDock) {
                props.onDock(); // Trigger dock
                setExpanded(false); // Collapse
            }

            document.removeEventListener('mousemove', doMove);
            document.removeEventListener('mouseup', stopMoveHandler);
        };

        document.addEventListener('mousemove', doMove);
        document.addEventListener('mouseup', stopMoveHandler);
    }, [dimensions, props.onDock]);

    // If chatModalVisible (sidebar) is open, hide this component
    if (props.chatModalVisible) return null;

    // If not yet visible (during position reset), hide this component
    if (!isVisible) return null;

    return (
        <div
            className={classNames(styles.expandableChatContainer, {
                [styles.expanded]: expanded,
                [styles.resizing]: !!resizingDirection || isDragging,
                [styles.noTransition]: noTransition,
                [styles.resizingTop]: resizingDirection === 'top',
                [styles.resizingRight]: resizingDirection === 'right',
                [styles.resizingLeft]: resizingDirection === 'left',
                [styles.resizingBottom]: resizingDirection === 'bottom',
                [styles.resizingCornerTr]: resizingDirection === 'corner-tr',
                [styles.resizingCornerTl]: resizingDirection === 'corner-tl',
                [styles.resizingCornerBr]: resizingDirection === 'corner-br',
                [styles.resizingCornerBl]: resizingDirection === 'corner-bl'
            })}
            style={{
                left: dimensions.left,
                bottom: dimensions.bottom,
                opacity: dimensions.opacity,
                ...(expanded ? {
                    width: dimensions.width,
                    height: dimensions.height
                } : {})
            }}
        >
            {/* [NEW] Ghost/Phantom Sidebar */}
            {isDragging && isHoveringDock && (
                <div className={styles.dockingPreview} />
            )}

            <button
                className={classNames(styles.expandableChatButton, { [styles.hidden]: expanded })}
                onClick={toggleChat}
            >
                <img
                    className={styles.chatButtonIcon}
                    draggable={false}
                    src={chatIcon}
                />
            </button>
            {expanded && (
                <div className={styles.expandedChatWindow}>
                    {/* Four corner resize handles */}
                    <div
                        className={styles.resizeHandleCornerTr}
                        onMouseDown={startResize('corner-tr')}
                    />
                    <div
                        className={styles.resizeHandleCornerTl}
                        onMouseDown={startResize('corner-tl')}
                    />
                    <div
                        className={styles.resizeHandleCornerBr}
                        onMouseDown={startResize('corner-br')}
                    />
                    <div
                        className={styles.resizeHandleCornerBl}
                        onMouseDown={startResize('corner-bl')}
                    />
                    <div
                        className={styles.resizeHandleTop}
                        onMouseDown={startResize('top')}
                    />
                    <div
                        className={styles.resizeHandleRight}
                        onMouseDown={startResize('right')}
                    />
                    <div
                        className={styles.resizeHandleLeft}
                        onMouseDown={startResize('left')}
                    />
                    <div
                        className={styles.resizeHandleBottom}
                        onMouseDown={startResize('bottom')}
                    />
                    <ChatComponent
                        onClose={toggleChat}
                        onDragHeader={startMove}
                        vm={props.vm}
                    />
                </div>
            )}
        </div>
    );
};

ExpandableChat.propTypes = {
    vm: PropTypes.shape({
        shareBlocksToTarget: PropTypes.func,
        editingTarget: PropTypes.shape({
            id: PropTypes.string
        }),
        refreshWorkspace: PropTypes.func,
        toJSON: PropTypes.func,
        loadProject: PropTypes.func
    }),
    chatModalVisible: PropTypes.bool,
    onDock: PropTypes.func,
    undockPosition: PropTypes.shape({
        left: PropTypes.number,
        bottom: PropTypes.number
    })
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

export default connect(mapStateToProps)(ExpandableChat);
