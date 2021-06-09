'use strict';
'require baseclass';

var P_NONE = 0,
    P_TERNARY = 1,
    P_OR = 2,
    P_AND = 3,
    P_EQUAL = 4,
    P_COMPARE = 5,
    P_ADD = 6,
    P_MUL = 7,
    P_UNARY = 8,
    P_CALL = 9;

var ExpressionParser = baseclass.extend({
	__init__: function(source, functions) {
		this.functions = Object.assign({}, functions);
		this.compile(source);
	},

	parseRules: {
		'boolean': [ 'constant', null, P_NONE ],
		'number': [ 'constant', null, P_NONE ],
		'string': [ 'constant', null, P_NONE ],
		'label': [ 'constant', null, P_NONE ],
		'null': [ 'constant', null, P_NONE ],
		'$': [ 'constant', null, P_NONE ],
		'@': [ 'constant', null, P_NONE ],

		'?': [ null, 'ternary', P_TERNARY ],
		'&&': [ null, 'and', P_AND ],
		'||': [ null, 'or', P_OR ],

		'==': [ null, 'binary', P_EQUAL ],
		'!=': [ null, 'binary', P_EQUAL ],

		'in': [ null, 'binary', P_COMPARE ],
		'<=': [ null, 'binary', P_COMPARE ],
		'>=': [ null, 'binary', P_COMPARE ],
		'<': [ null, 'binary', P_COMPARE ],
		'>': [ null, 'binary', P_COMPARE ],

		'-': [ 'unary', 'binary', P_ADD ],
		'+': [ 'unary', 'binary', P_ADD ],

		'/': [ null, 'binary', P_MUL ],
		'*': [ null, 'binary', P_MUL ],
		'%': [ null, 'binary', P_MUL ],

		'!': [ 'unary', null, P_UNARY ],

		'(': [ 'paren', 'call', P_CALL ],
		'[': [ null, 'subscript', P_CALL ],
		'.': [ null, 'dot', P_CALL ]
	},

	tokenMatch: /^[\n\s]*(!=|==|>=|<=|\|\||&&|[()<>.,\[\]!@\$*\/%?:+-]|in\b|null\b|(true|false)\b|0x([0-9a-fA-F])|([0-9]+(?:\.[0-9]+)?)\b|([A-Za-z_][A-Za-z0-9_]*)\b|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))(.*)$/,

	tokenParse: [
		null,
		null,
		function(s) { return { type: 'boolean', value: s === 'true' } },
		function(s) { return { type: 'number', value: parseInt(s, 16) } },
		function(s) { return { type: 'number', value: parseFloat(s) } },
		function(s) { return { type: 'label', value: s } },
		function(s) {
			return {
				type: 'string',
				value: s.substring(1, s.length - 1).replace(/\\(?:u([A-Fa-f0-9]{4})|x([A-Fa-f0-9]{2})|(.))/g, function(m, u, x, c) {
					if (u || x)
						return String.fromCharCode(parseInt(u || x, 16));

					switch (c) {
					case 'n': return '\n';
					case 't': return '\t';
					case 'r': return '\r';
					default: return c;
					}
				})
			};
		}
	],

	nextToken: function() {
		if (!this.source.length)
			return { type: 'eof' };

		var m = this.source.match(this.tokenMatch);

		if (m === null)
			throw 'Unexpected character near `…' + this.source + '`';

		this.source = m[m.length - 1];

		for (var i = m.length - 1; i > 0; i--) {
			if (m[i - 1] == null)
				continue;

			if (this.tokenParse[i - 1] !== null)
				return this.tokenParse[i - 1].call(this, m[i - 1]);

			return { type: m[i - 1] };
		}
	},

	advance: function() {
		this.prevToken = this.currToken;

		if (this.tokenIdx < this.tokens.length)
			this.currToken = {
				type: this.tokens[this.tokenIdx++],
				value: this.tokens[this.tokenIdx++]
			};
		else
			this.currToken = { type: 'eof' };
	},

	check: function(tokenType) {
		return (this.currToken.type === tokenType);
	},

	match: function(tokenType) {
		if (!this.check(tokenType))
			return false;

		this.advance();

		return true;
	},

	consume: function(tokenType) {
		if (!this.match(tokenType))
			throw 'Expecting "' + tokenType + '" near `…' + this.source + '`';
	},

	parse: function(precedence, noaction) {
		this.advance();

		var rule = this.parseRules[this.prevToken.type];

		if (!rule || !rule[0]) {
			//throw 'Expecting expression';
			return;
		}

		this.parseFunctions[rule[0]].call(this, noaction);

		while (true) {
			rule = this.parseRules[this.currToken.type];

			if (precedence > (rule ? rule[2] : P_NONE))
				break;

			this.advance();
			this.parseFunctions[rule[1]].call(this, noaction);
		}
	},

	parseFunctions: {
		paren: function(noaction) {
			this.parse(P_TERNARY, noaction);
			this.consume(')');
		},

		call: function(noaction) {
			var fn = this.currentValue,
			    args = [];

			if (!this.check(')')) {
				do {
					this.parse(P_TERNARY, noaction);
					args.push(this.currentValue);
				}
				while (this.match(','));
			}

			this.consume(')');

			if (!noaction) {
				if (typeof(fn) === 'function')
					this.currentValue = fn.apply(null, args);
				else
					this.currentValue = null;
			}
		},

		unary: function(noaction) {
			var op = this.prevToken.type;

			this.parse(P_UNARY, noaction);

			switch (!noaction && op) {
			case '!': this.currentValue = !this.currentValue; break;
			case '-': this.currentValue = -this.currentValue; break;
			case '+': this.currentValue = +this.currentValue; break;
			}
		},

		binary: function(noaction) {
			var op = this.prevToken.type,
			    val1 = this.currentValue,
			    val2 = null;

			this.parse(this.parseRules[op][2] + 1, noaction);

			val2 = this.currentValue;

			switch (!noaction && op) {
			case '+': this.currentValue = val1 + val2; break;
			case '-': this.currentValue = val1 - val2; break;
			case '*': this.currentValue = val1 * val2; break;
			case '/': this.currentValue = val1 / val2; break;
			case '%': this.currentValue = val1 % val2; break;
			case '<': this.currentValue = val1 < val2; break;
			case '>': this.currentValue = val1 > val2; break;
			case '<=': this.currentValue = val1 <= val2; break;
			case '>=': this.currentValue = val1 >= val2; break;
			case '==': this.currentValue = val1 == val2; break;
			case '!=': this.currentValue = val1 != val2; break;
			case 'in':
				if (typeof(val2) === 'string' || Array.isArray(val2))
					this.currentValue = (val2.indexOf(val1) !== -1);
				else if (val2 !== null && typeof(val2) === 'object')
					this.currentValue = (val1 in val2);
				else
					this.currentValue = (val1 == val2);

				break;
			}
		},

		constant: function(noaction) {
			switch (!noaction && this.prevToken.type) {
			case 'null':
			case 'number':
			case 'string':
			case 'boolean':
				this.currentValue = this.prevToken.value;
				break;

			case 'label':
				this.currentValue = this.functions[this.prevToken.value] || null;
				break;

			case '$':
				this.currentValue = this.rootContext;
				break;

			case '@':
				this.currentValue = this.currentContext;
				break;
			}
		},

		and: function(noaction) {
			this.parse(P_AND, noaction || !this.currentValue);
		},

		or: function(noaction) {
			this.parse(P_OR, noaction || !!this.currentValue);
		},

		dot: function(noaction) {
			this.consume('label');

			if (!noaction) {
				var newValue = null;

				if (this.currentValue !== null && this.currentValue !== undefined)
					newValue = this.currentValue[this.prevToken.value];

				if (typeof(newValue) === 'function')
					newValue = newValue.bind(this.currentValue);

				this.currentValue = newValue;
			}
		},

		subscript: function(noaction) {
			var previousValue = this.currentValue;

			this.parse(P_TERNARY, noaction);
			this.consume(']');

			if (!noaction) {
				var newValue = null;

				if (previousValue !== null && previousValue !== undefined)
					newValue = previousValue[this.currentValue];

				if (typeof(newValue) === 'function')
					newValue = newValue.bind(previousValue);

				this.currentValue = newValue;
			}
		},

		ternary: function(noaction) {
			var conditionValue = this.currentValue;

			this.parse(P_TERNARY, noaction || !conditionValue);
			this.consume(':');
			this.parse(P_OR, noaction || !!conditionValue);
		}
	},

	compile: function(source) {
		this.source = String(source).trim();
		this.tokens = [];

		for (var token = this.nextToken(); token.type != 'eof'; token = this.nextToken())
			this.tokens.push(token.type, token.value);
	},

	eval: function(rootContext, currentContext) {
		this.rootContext = Object.assign({}, rootContext);
		this.currentContext = Object.assign({}, currentContext);
		this.currentValue = null;
		this.tokenIdx = 0;

		this.advance();
		this.parse(P_TERNARY, false);

		if (this.tokenIdx < this.tokens.length)
			throw 'Expecting end of expression';

		return this.currentValue;
	}
});

var ValueBinding = baseclass.extend({
	__init__: function(template, node, valueQuery) {
		this.template = template;
		this.node = node;
		this.valueQuery = valueQuery;

		this.currentValue = null;
	},

	update: function(rootCtx, currentCtx) {
		var val = this.valueQuery.eval(rootCtx, currentCtx);

		if (val !== this.currentValue) {
			this.node.innerText = (val !== null) ? val : '';
			this.currentValue = val;
		}
	}
});

var ForeachBinding = baseclass.extend({
	__init__: function(template, anchorNode, templateNode) {
		this.template = template;
		this.anchorNode = anchorNode;
		this.templateNode = templateNode;
		this.valueQuery = new ExpressionParser(templateNode.getAttribute('tpl-foreach') || '');

		if (templateNode.hasAttribute('tpl-sort'))
			this.sortQuery = new ExpressionParser(templateNode.getAttribute('tpl-sort'));

		if (templateNode.hasAttribute('tpl-key'))
			this.idQuery = new ExpressionParser(templateNode.getAttribute('tpl-key'));

		this.currentItems = {};
	},

	matchAttributeName: 'tpl-foreach',

	values: function(rootCtx, currentCtx) {
		return this.template.lookupCollection(
			this.valueQuery, this.idQuery, this.sortQuery,
			rootCtx, currentCtx
		);
	},

	update: function(rootCtx, currentCtx) {
		var values = this.values(rootCtx, currentCtx),
		    newIds = {};

		for (var i = 0; i < values.length; i++) {
			var itemId = values[i][0],
			    itemSort = values[i][1],
			    itemCtx = values[i][2];

			newIds[itemId] = true;

			if (!this.currentItems.hasOwnProperty(itemId)) {
				var newItemNode = this.templateNode.cloneNode(true),
				    newBindings = [];

				this.currentItems[itemId] = [ newItemNode, newBindings ];

				this.anchorNode.parentNode.insertBefore(newItemNode, this.anchorNode.nextSibling);

				this.template.parseNode(newItemNode, newBindings, this.matchAttributeName);
			}

			for (var j = 0; j < this.currentItems[itemId][1].length; j++)
				this.currentItems[itemId][1][j].update(rootCtx, itemCtx);
		}

		for (var existingItemId in this.currentItems) {
			if (!newIds.hasOwnProperty(existingItemId)) {
				var deleteItemNode = this.currentItems[existingItemId][0];

				deleteItemNode.parentNode.removeChild(deleteItemNode);

				delete this.currentItems[existingItemId];
			}
		}
	}
});

var IfBinding = baseclass.extend({
	__init__: function(template, anchorNode, templateNode) {
		this.template = template;
		this.anchorNode = anchorNode;
		this.templateNode = templateNode;
		this.valueQuery = new ExpressionParser(templateNode.getAttribute('tpl-if') || '');
	},

	matchAttributeName: 'tpl-if',

	update: function(rootCtx, currentCtx) {
		var value = this.valueQuery.eval(rootCtx, currentCtx);

		if (value) {
			if (!this.currentNode) {
				var newItemNode = this.templateNode.cloneNode(true),
				    newBindings = [];

				this.currentNode = newItemNode;
				this.currentBindings = newBindings;

				this.anchorNode.parentNode.insertBefore(newItemNode, this.anchorNode.nextSibling);
				this.template.parseNode(newItemNode, newBindings, this.matchAttributeName);
			}

			for (var i = 0; i < this.currentBindings.length; i++)
				this.currentBindings[i].update(rootCtx, currentCtx);
		}
		else if (this.currentNode) {
			this.currentNode.parentNode.removeChild(this.currentNode);
			this.currentNode = null;
			this.currentBindings = null;
		}
	}
});

var EventBinding = baseclass.extend({
	__init__: function(template, node, event, valueQuery) {
		this.template = template;
		this.node = node;
		this.event = event;

		if (typeof(valueQuery) == 'string')
			this.evfn = new Function(valueQuery);
		else
			this.valueQuery = valueQuery;

		this.currentEventFunction = null;
	},

	update: function(rootCtx, currentCtx) {
		var evfn = null;

		if (this.valueQuery)
			evfn = this.valueQuery.eval(rootCtx, currentCtx);
		else
			evfn = this.evfn;

		if (evfn !== this.currentEventFunction) {
			if (this.currentEventFunction !== null) {
				this.node.removeEventListener(this.event, this.currentEventFunction);
				this.currentEventFunction = null;
			}

			if (typeof(evfn) === 'function') {
				this.node.addEventListener(this.event, evfn);
				this.currentEventFunction = evfn;
			}
		}
	}
});

var AttributeBinding = baseclass.extend({
	__init__: function(template, attr, valueQuery) {
		this.template = template;
		this.attr = attr;
		this.valueQuery = valueQuery;

		this.currentValue = null;
	},

	update: function(rootCtx, currentCtx) {
		var val = this.valueQuery.eval(rootCtx, currentCtx);

		if (val !== this.currentValue) {
			this.attr.value = (val !== null) ? val : '';
			this.currentValue = val;
		}
	}
});

var BindingClasses = [
	IfBinding,
	ForeachBinding
];

var Template = baseclass.extend({
	__init__: function(node) {
		if (typeof(node) === 'string')
			node = document.querySelector(node);

		if (node instanceof Node) {
			this.anchorNode = node;

			if ('content' in node)
				this.templateNode = node.content.cloneNode(true);
			else
				this.templateNode = node.cloneNode(true);
		}

		if (!this.templateNode)
			this.templateNode = document.createDocumentFragment();
	},

	lookupCollection: function(valueQuery, idQuery, sortQuery, rootCtx, currentCtx) {
		var collection = valueQuery.eval(rootCtx, currentCtx),
		    values = [];

		if (collection === null || typeof(collection) !== 'object')
			return values;

		if (!sortQuery)
			sortQuery = idQuery;

		if (Array.isArray(collection)) {
			for (var i = 0; i < collection.length; i++) {
				values.push([
					idQuery ? idQuery.eval(rootCtx, collection[i]) : i,
					sortQuery ? sortQuery.eval(rootCtx, collection[i]) : i,
					collection[i]
				]);
			}
		}
		else {
			for (var prop in collection) {
				if (!collection.hasOwnProperty(prop))
					continue;

				values.push([
					idQuery ? idQuery.eval(rootCtx, collection[prop]) : prop,
					sortQuery ? sortQuery.eval(rootCtx, collection[prop]) : prop,
					collection[prop]
				]);
			}
		}

		values.sort(function(a, b) {
			var x = +a[1],
			    y = +b[1];

			if (x !== x || y !== y) {
				if (a[1] < b[1])
					return 1;
				else if (a[1] > b[1])
					return -1;
				else
					return 0;
			}
			else {
				return (y - x);
			}
		});

		return values;
	},

	parseNode: function(rootNode, bindings, forAttribute) {
		var matchedNodes = [];

		var treeWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT, {
			acceptNode: function(node) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					if (node.hasAttribute('translate') && node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
						node.firstChild.data = _(node.firstChild.data);
					}

					for (var i = 0; i < BindingClasses.length; i++) {
						var matchAttribute = BindingClasses[i].prototype.matchAttributeName;

						if (node === rootNode && forAttribute != null && forAttribute !== matchAttribute)
							continue;

						if (node.hasAttribute(matchAttribute)) {
							matchedNodes[i] = matchedNodes[i] || [];
							matchedNodes[i].push(node);

							return NodeFilter.FILTER_REJECT;
						}
					}
				}

				return NodeFilter.FILTER_ACCEPT;
			}
		});

		var replaceList = [];

		for (var node = treeWalker.nextNode(); node !== null; node = treeWalker.nextNode()) {
			switch (node.nodeType) {
			case Node.COMMENT_NODE:
				var s = node.data.match(/^\s*\{(.*)\}\s*$/);

				if (!s)
					continue;

				var n = document.createElement('span');

				replaceList.push(node, n);
				bindings.push(new ValueBinding(this, n, new ExpressionParser(s[1])));

				break;

			case Node.ELEMENT_NODE:
				if (!node.hasAttributes())
					continue;

				for (var i = 0, attr = node.attributes[0]; i < node.attributes.length; attr = node.attributes[++i]) {
					var m = attr.name.match(/^tpl-on(\w+)$/);

					if (m) {
						var p = new ExpressionParser(attr.value);

						bindings.push(new EventBinding(this, node, m[1], p || attr.value));
					}
					else {
						m = attr.value.match(/^\s*\{(.*)\}\s*$/);

						if (m) {
							var p = new ExpressionParser(m[1]);

							bindings.push(new AttributeBinding(this, attr, p));
						}
					}
				}

				break;
			}
		}

		for (var i = 0; i < matchedNodes.length; i++) {
			if (!matchedNodes[i])
				continue;

			for (var j = 0; j < matchedNodes[i].length; node = j++) {
				var BindingClass = BindingClasses[i],
				    attributeName = BindingClass.prototype.matchAttributeName,
				    anchorNode = document.createComment(attributeName + ' ' + matchedNodes[i][j].getAttribute(attributeName));

				replaceList.push(matchedNodes[i][j], anchorNode);
				bindings.push(new BindingClass(this, anchorNode, matchedNodes[i][j]));
			}
		}

		for (var i = 0; i < replaceList.length; i += 2) {
			var oldNode = replaceList[i + 0],
			    newNode = replaceList[i + 1];

			oldNode.parentNode.replaceChild(newNode, oldNode);
		}
	},

	render: function(currentCtx) {
		this.bindings = [];
		this.parseNode(this.templateNode, this.bindings);
		this.update(currentCtx);

		return this.templateNode;
	},

	update: function(currentCtx) {
		for (var i = 0; Array.isArray(this.bindings) && i < this.bindings.length; i++)
			this.bindings[i].update(currentCtx, currentCtx);
	},

	display: function(currentCtx) {
		if (this.anchorNode) {
			this.anchorNode.parentNode.insertBefore(this.render(currentCtx), this.anchorNode.nextSibling);

			return true;
		}

		return false;
	}
});

return baseclass.extend({
	fromString: function(s) {
		var t = document.createElement('template');

		t.innerHTML = s;

		return new Template(t);
	},

	fromNode: function(n) {
		return new Template(n);
	},

	fromQuery: function(q) {
		return new Template(document.querySelector(q));
	}
});
