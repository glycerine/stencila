'use strict';

var IsolatedNodeComponent = require('substance/ui/IsolatedNodeComponent');
var ContainerEditor = require('substance/ui/ContainerEditor');
var deleteNode = require('substance/model/transform/deleteNode');
var each = require('substance/node_modules/lodash/each');

var moment = require('moment');

function DiscussionComponent () {

  DiscussionComponent.super.apply(this, arguments);

  this.ContentClass = ContainerEditor;

  document.addEventListener('mark:selected', this.onMarkSelected.bind(this));

}

DiscussionComponent.Prototype = function () {

  var _super = DiscussionComponent.super.prototype;

  /**
   * Method override for custom display state
   */
  this.getInitialState = function () {

    return {
      displayed: false,
      markPosition: null
    };

  };

  /**
   * Method override so no blocker is rendered over this
   * `IsolatedNodeComponent` (requires two clicks to begin editing)
   */
  this.shouldRenderBlocker = function () {

    return false;

  };

  /**
   * Method override to render component
   */
  this.render = function ($$) {

    var el = _super.render.call(this, $$)
      .addClass('sc-discussion ' + (this.state.displayed ? 'sm-displayed' : ''))
      .insertAt(0,
        $$('div')
          .ref('header')
          .addClass('se-header')
          .attr('contenteditable', false)
          .append(
            $$('button')
              .ref('icon')
              .addClass('se-icon')
              .append(
                $$('i')
                  .addClass('fa fa-comments-o')
              ),
            $$('button')
              .ref('hide')
              .addClass('se-hide')
              .append(
                $$('i')
                  .addClass('fa fa-close')
              )
              .on('click', this.onHideClicked, this)
          )
      )
    .append(
        $$('div')
          .ref('footer')
          .addClass('se-footer')
          .attr('contenteditable', false)
          .append(
            $$('button')
              .ref('add')
              .addClass('se-add')
              .attr('title', 'Add comment to discussion')
              .append(
                $$('i')
                  .addClass('fa fa-reply')
              )
              .on('click', this.onAddClicked, this),
            $$('button')
              .ref('delete')
              .addClass('se-delete')
              .attr('title', 'Delete discussion')
              .append(
                $$('i')
                  .addClass('fa fa-trash')
              )
              .on('click', this.onDeleteClicked, this)
          )
    );
    // Calculate position based on the size of the margin for the
    // document content. Calculations done using ems assuming 16px em size.
    // TODO Get height discussion element so can centre it next to the mark
    var content = document.querySelector('.se-content');
    var em = 16;
    var position, top, left, right;
    if (content) {

      var contentRect = content.getBoundingClientRect();
      var margin = parseInt(window.getComputedStyle(content).getPropertyValue('margin-right').match(/\d+/));
      if (margin >= 20 * em) {

        // Room to place the discussion in the right margin.
        // Place vertically aligned with centre of mark and left side to left of content
        position = 'absolute';
        if (this.state.markPosition) {

          top = Math.max(0, this.state.markPosition.top + this.state.markPosition.height / 2 - 5 * em) + 'px';

        } else {

          top = em + 'px';

        }
        left = (contentRect.width + em) + 'px';
        right = 'inherit';

      } else {

        // Not enough room in margin
        // Place below the mark with right side (almost) aligned to right of content
        position = 'absolute';
        if (this.state.markPosition) {

          top = (this.state.markPosition.top + this.state.markPosition.height + em) + 'px';

        } else {

          top = em + 'px';

        }
        left = 'inherit';
        right = (margin + em) + 'px';

      }

    } else {

      // Fallback to top-right of screen
      position = 'fixed';
      top = em + 'px';
      right = em + 'px';

    }
    el.css({
      position: position,
      top: top,
      left: left,
      right: right
    });

    return el;

  };

  /**
   * Event method to change display state. Called when any
   * mark is selected.
   *
   * @param      {<type>}  event   The event
   */
  this.onMarkSelected = function (event) {

    this.extendState({
      displayed: event.detail.discussionId === this.props.node.id,
      markPosition: event.detail.markPosition
    });

  };

  /**
   * Event method for when the hide button is clicked.
   */
  this.onHideClicked = function () {

    this.extendState({
      displayed: false
    });

  };

  /**
   * Event method for when the add button is clicked.
   */
  this.onAddClicked = function () {

    var discussion = this.props.node;
    var user = this.context.documentSession.config.user;
    var surface = this.context.surfaceManager.getFocusedSurface();
    surface.transaction(function (tx, args) {

      // Create a new comment
      var paragraph = tx.create({
        type: 'paragraph'
      });
      var comment = tx.create({
        type: 'comment',
        who: '@' + user,
        when: moment().format(),
        nodes: [paragraph.id]
      });
      // Append to the end of the discussion
      discussion.show(comment.id);

      // FIXME
      // The first time the add button is clicked the new comment appears but
      // seems like the whole discussion is selected. Then subsequent clicks
      // don't add anything. Seems to be reated to selection.
      console.warn('FIXME');

      args.node = paragraph;
      args.selection = tx.createSelection([paragraph.id, 'content'], 0, 0);

      return args;

    });

  };

  /**
   * Event method for deleting this discussion and associated `Mark`
   */
  this.onDeleteClicked = function () {

    var discussion = this.props.node;
    var session = this.context.documentSession;
    // Destroy this component first
    this.remove();
    session.transaction(function (tx, args) {

      // Delete the discussion and associated mark
      deleteNode(tx, { nodeId: discussion.id });
      each(session.doc.getNodes(), function (node) {

        if (node.type === 'mark' && node.target === discussion.id) {

          deleteNode(tx, { nodeId: node.id });

        }

      });
      // Return a null selection
      args.selection = tx.createSelection(null);
      return args;

    });

  };

};

IsolatedNodeComponent.extend(DiscussionComponent);

module.exports = DiscussionComponent;
