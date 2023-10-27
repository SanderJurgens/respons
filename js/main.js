/*--------------------------------------------------------------
# Global variables
--------------------------------------------------------------*/

// Dimensions of the graph
const width = window.innerWidth;
    height = window.innerHeight;

// Color scheme
const blue = "#003082",
    yellow = "#FFC917",
    red = "#DB0029",
    white = "#FFFFFF",
    gray = "#E6E6E9";

// Generic visualisation values
const duration = 750, // of graph transition
    nodeRadius = 10,
    nodeSpacing = 5,
    elbowSize = 25,
    linkStrokeWidth = 2,
	nodeStrokeWidth = 3,
	labelStrokeWidth = 2,
	labelFontSize = "12px",
	labelOffset = "0.3em", // depends on font-size
    labelMargin = 10,
    zoomLimit = [0.5, 2];

// Generic search values
const pageSize = 50,
    placeholder = "Search for department/colleague";
	
// Right-click menu
const menu = [
  {
	title: 'Request link',
	action: function(d, i) {
	  relocateToURL(d.id);
	}
  },
  {
	title: 'Go to manager',
	action: function(d, i) {
	  relocateToURL(d.data.managerid);
	},
	disabled: function(d, i) {
	  return isDepartment(d.data);
	}
  }
];

/*--------------------------------------------------------------
# Load data
--------------------------------------------------------------*/

// Read and display the datafile
//loadJSON("../data/company.json");
loadCSV("../data/company.csv");

// Load flat CSV data and transform to hierachy
async function loadCSV(file) {
  // Asynchronous reading of flat CSV file
  const flat = await d3.dsv(";", file, (d) => { 
    return d;
  });
    
   // Transform flat data into hierarchical data
  const root = d3.stratify()
    .id(function(d) { return d.id; })
    .parentId(function(d) { return d.parent; })
    (flat);

  // Setup tree from hierarchical data
  setupTree(root); 
}

// Load hierarchical JSON data, in which elements have "children" accessor
async function loadJSON(file) {
  // Asynchronous reading of JSON file
  const data = await d3.json(file);
  const root = d3.hierarchy(data);
  
  // Add id's to nodes (from given data)
  root.descendants().forEach((d, i) => {
    d.id = d.data.id;
	//d.id = i; // Alternatively, if no id's are given
  });
  
  // Setup tree from hierarchical data
  setupTree(root);
}

/*--------------------------------------------------------------
# Setup tree
--------------------------------------------------------------*/

// Setup tree visualization and search from hierarchical data
function setupTree(root) {
  
  // Local function to measure widest node label
  // Doesn't fully avoid overlap, but severely reduces it
  const canvas = document.createElement('canvas');
  const context = canvas.getContext("2d");
  context.font = getComputedStyle(document.body).font;
  function widestLabel(root) {
    var w = 0;
    root.descendants().forEach((d, i) => {
      w = Math.max(
	    w, 
	    (elbowSize + labelMargin + 2 * nodeRadius) + context.measureText(d.data.depname).width,
	    (elbowSize + labelMargin + 2 * nodeRadius) + context.measureText(d.data.colname + " (" + d.data.coltitle + ")").width
	  );
    });
    return w;
  }

  // Rows are separated by dx pixels, columns by dy pixels. These names can be counter-intuitive
  // (dx is a height, and dy a width). This because the tree must be viewed with the root at the
  // “bottom”, in the data domain. The width of a column is based on the tree’s height.
  const dx = (2 * nodeRadius) + nodeSpacing;
  const dy = widestLabel(root);
  
  // Add SVG container to the page
  const svg = d3.select("#content")
      .append("svg")
      .attr("preserveAspectRatio", "none")
      .attr("viewBox", [-dy, -height/2, width, height])
      .style("background-color", gray)
	  .style('font-family', '"Open Sans", sans-serif')
      .style("font-size", labelFontSize)
  	  .style("font-weight", "bold")
      .style("user-select", "none");
	  
  const g = svg.append("g")
      .classed("svg-content", true);
      
  // Define pan and zoom functionality
  const handleZoom = (e) => g.attr('transform', e.transform);
  const zoom = d3.zoom()
      .scaleExtent(zoomLimit)
      .on('zoom', handleZoom);
  svg.call(zoom);	  

  // Setup viewpoint reset button
  document.getElementById("reset").onclick = function() {
	svg.transition().duration(duration).call(
      zoom.transform,
      d3.zoomIdentity
    );
  }

  // Create a layer for the links
  const gLink = g.append("g")
      .attr("fill", "none")
      .attr("stroke", blue);

  // Create a layer for the nodes
  const gNode = g.append("g")
      .attr("cursor", "pointer")
      .attr("pointer-events", "all");

  // Create tree with given node sizes
  const tree = d3.tree().nodeSize([dx, dy]);
  
  // Set initial location of root
  root.x0 = 0;
  root.y0 = 0;
  
  // Close all nodes beyond the roots decendants
  if (root.children) { root.children.forEach(collapse); }
  
  /*--------------------------------------------------------------
  # Setup search
  --------------------------------------------------------------*/
   
  // Setup searchbar for search of departments and colleagues
  function setupSearch(source) {

    // Search datasets
    var depData = [], 
        colData = [],
	    searchObjects = [];

    // Collect data from given hierarchy  
    function collectData(d) {    
      if (isDepartment(d.data)){
	    // Add department to separate dataset
	    depData.push(d.data.depname + "|" + d.id);
	
	    // Recurse trough tree 
	    if (d.children) {
	      d.children.forEach(collectData);
	    } else if (d._children) {
	      d._children.forEach(collectData);
	    }
      } else {
	    // Add colleague to separate dataset
	    colData.push(d.data.colname + "|" + d.data.coltitle + "|" + d.id);
      }
    }
  
    // Start collecting data from given node
    collectData(source);

    // Sort a given dataset and add ascending id's
    function sortData(data, offset) {
	  data.sort(function(a, b) {
		  var alc = a.toLowerCase();
		  var blc = b.toLowerCase();
		  if (alc > blc) return 1; 
		  if (alc < blc) return -1;
		  return 0;
	  }).filter(function(item, i, ar) {
		  searchObjects.push({
			  "id": offset + i,
			  "text": item
		  });
	  });	  
    }
  
    // Sort departments and colleagues respectively
    sortData(depData, 0);
    const numDep = searchObjects.length
    sortData(colData, numDep);
  
    // Add data to searchbar
    $.fn.select2.amd.require(
      ['select2/data/array', 'select2/utils'],
      function (ArrayData, Utils) {
		
	    // Helper functions for pagination
	    function CustomData($element, options) {
	      CustomData.__super__.constructor.call(this, $element, options);
	    }
	    function contains(str1, str2) {
		  return str2 == undefined ? true : str1.toLowerCase().includes(str2.toLowerCase());
	    }
	    Utils.Extend(CustomData, ArrayData);
		
	    // Define pagination
	    CustomData.prototype.query = function(params, callback) {
	      if (!("page" in params)) {
            params.page = 1;
	      }
	      var results = searchObjects.filter(function(elem) { 
		    // Feature: You can also search on dep/col id, since its in the element text
		    return contains(elem.text, params.term);
	      });
	      var data = {};
	      data.results = results.slice((params.page - 1) * pageSize, params.page * pageSize);
	      data.pagination = {};
	      data.pagination.more = params.page * pageSize < results.length;
	      callback(data);
	    };
	
	    // Determine the format of the searchbar
	    function formatSearchbar (optionElement) {
	      var split = optionElement.text.split("|");
	      if (optionElement.id < numDep) {
		    return $('<span><strong>' + split[0] + '</strong></span>');
	      } else {
		    return $('<span>' + split[0] + ' <i>(' + split[1] + ')</i></span>');
	      }
	    };
		
		// Apply the given format (including pagination)
	    $("#searchbar").select2({
	      templateResult: formatSearchbar,
	      templateSelection: formatSearchbar,
	      placeholder: placeholder,
	      allowClear: true,
	      ajax:{},		  
	      dataAdapter:CustomData
	    }).select2("val",0);
      }
	);

    // Add searchbar functionality for searching
    $("#searchbar").on("select2:select", function(e) {
	  // Reset and prepare for search
      clearAll(root);
	  expand(root);
      root.children.forEach(collapse);
	  
	  // Perform search labeling
	  var split = e.params.data.text.split("|");
	  search(root, split[split.length-1]);
	  
	  // Expand found path and redraw
	  expandAllFound(root); 
	  update(null, root);
    });
  
    // Add searchbar functionality for unselecting search
    $("#searchbar").on("select2:unselect", function(e) {
	  clearAll(root);
	  update(null, root);
    });  
  }
  
  // Prepare searching functionality for entire tree
  setupSearch(root);
  
  // Perform initial search for node if get paramater is set
  var gets = parseGET(window.location.href);
  if (gets != undefined) {
    if (gets.node[0] != null) {
      search(root, gets.node[0]);
      expandAllFound(root);
    }
  }
  
  /*--------------------------------------------------------------
  # Update visualization
  --------------------------------------------------------------*/
    
  // Update visualization
  function update(event, source) {
    // Retrieve all nodes and links
	const nodes = root.descendants().reverse(); // bottom-up
    const links = root.links().sort((a,b) => foundLast(a,b)); //found-last    

    // Compute the new tree layout.
    tree(root);
		
    // Set transition duration of update
	const transition = svg.transition().duration(duration);
	
    // -----
	
	// Update the nodes…
    const node = gNode.selectAll("g")
        .data(nodes, d => d.id);
	
    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node.enter().append("g")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0)
        .on("click", (event, d) => {
          // Clear search results
		  clearAll(root);
		  $("#searchbar").val(-1).trigger("change");
		  
		  // Toggle and update
		  toggle(d);		  
          update(event, d);		  
        })
		.on('contextmenu', d3.contextMenu(menu));	
	
    // Node shape
    nodeEnter.append("circle")
		.attr("r", 1e-6)
	    .attr("stroke", yellow) // Enter yellow/white, apply red for found on update
		.attr("stroke-width", nodeStrokeWidth)
		.style("fill", d => (d.children || !d._children) ? white : yellow);		

    // Node labels
	nodeEnter.append("text")
	    .attr("dy", labelOffset)
		.attr("x", d => isDepartment(d.data) ? (-1 * (elbowSize + labelMargin)) : (nodeRadius + labelMargin))
        .attr("text-anchor", d => isDepartment(d.data) ? "end" : "start")		
        .text(d => isDepartment(d.data) ? d.data.depname : d.data.colname)
		.style("fill-opacity", 1e-6)
		.attr("stroke", gray)		
		.attr("stroke-width", labelStrokeWidth)
		.attr("paint-order", "stroke fill")
		.attr("stroke-opacity", 1e-6)		
		.append("tspan")
	      .style("font-style", "italic")
	      .text(d => isDepartment(d.data) ? "" : " (" + d.data.coltitle + ")");

    // Transition nodes to their new position.
    const nodeUpdate = node.merge(nodeEnter).transition(transition)
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .attr("fill-opacity", 1)
        .attr("stroke-opacity", 1);
	
    // Update node shape
    nodeUpdate.select("circle")
	    .attr("r", nodeRadius)
	    .style("fill", function(d) {
	      if (d.class === "found") {
		    return red;
	      } else if (d.children || !d._children ) {
		    return white;
	      } else {
		    return yellow;
	      }
	    })
	    .style("stroke", function(d) {
	      if (d.class === "found" || d.class === "found-path") {
		    return red;
	      }
	    });
     
    // Update node labels
    nodeUpdate.select("text")
	    .attr("stroke-opacity", 1)
		.style("fill-opacity", 1)
	    .style("fill", function(d) {
	      if (d.class === "found" || d.class === "found-path") {
		    return red;
	      }
	    });
	
    // Transition exiting nodes to the parent's new position.
    const nodeExit = node.exit().transition(transition).remove()
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .attr("fill-opacity", 1e-6)
        .attr("stroke-opacity", 1e-6);
	
    // Remove node shape
    nodeExit.select("circle")
	    .attr("r", 1e-6);

    // Remove node labels
    nodeExit.select("text")
	    .attr("stroke-opacity", 1e-6)
	    .style("fill-opacity", 1e-6);
	 
	// -----
  
    // Update the links…
    const link = gLink.selectAll("path")
		.data(links, d => d.target.id)
		.order(); // Re-order according to sorted links dataset order
	
	// Enter any new links at the parent's previous position.
    const linkEnter = link.enter().append("path")
        .style("stroke-opacity", 1e-6)
        .attr("stroke-width", 1e-6)
        .attr("d", d => {
          const o = {x: source.x0, y: source.y0};
          return elbow({source: o, target: o});
        });
	
    // Transition links to their new position.
    link.merge(linkEnter).transition(transition)
        .style("stroke-opacity", 1)
        .attr("stroke-width", linkStrokeWidth)
        .attr("d", elbow)
		.style("stroke", d => {
	      if (d.target.class === "found" || d.target.class === "found-path") {
		    return red;
	      }
	    });

    // Transition exiting nodes to the parent's new position.
    link.exit().transition(transition).remove()
        .style("stroke-opacity", 1e-6)
        .attr("stroke-width", 1e-6)
        .attr("d", d => {
          const o = {x: source.x, y: source.y};
          return elbow({source: o, target: o});
        });

    // -----

    // Stash the old positions for transition.
    root.eachBefore(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }
   
  // Initialize with first visualization update
  update(null, root);
}

/*--------------------------------------------------------------
# Helper functions - Visual
--------------------------------------------------------------*/

// Define the link shape from parent to child nodes
function elbow(d) {
  return "M" + d.source.y + "," + d.source.x
	+ "H" + (d.source.y + (d.target.y - d.source.y) - elbowSize)
	+ "V" + d.target.x
	+ "H" + d.target.y;
}

// Order set of links based on found(-path) class
function foundLast(a, b) {
  if ((a.target.class === "found" || a.target.class === "found-path") && 
	(b.target.class !== "found" || b.target.class !== "found-path")) {
    return 1; 
  }
  else { 
    return -1; 
  }
}

/*--------------------------------------------------------------
# Helper functions - Tree interaction
--------------------------------------------------------------*/

// Check whether node is a department
function isDepartment(d) {
  return !(d.depname == null || d.depname == "" || d.depname == "-");
}

// Toggle children
function toggle(d) {
  if (isDepartment(d.data)) {
	if (d.children) {
	  collapse(d);
    } else {
	  expand(d);
    }	
  } else {
    window.open("http://www.google.com"); // Example: Open link to new website
  }  
}

// Collapse a node and all it's children
function collapse(d) {
  if (d.children) {
	d._children = d.children;
	d._children.forEach(collapse);
	d.children = null;
  }
}

// Expand a node
function expand(d) {
  if (d._children) {
	d.children = d._children;
	d._children = null;
  }
}

// Expand all nodes that are found in the search
function expandAllFound(d) {
  if (d.class === "found-path") {
	expand(d);
	d.children.forEach(expandAllFound);
  }
}

/*--------------------------------------------------------------
# Helper functions - Searching
--------------------------------------------------------------*/

// Perform a recursive search, label resulting path
function search(d, id) {
  if (d.id == id)  { // found destination node
    d.class = "found";
    return true;
  } else if (d.children) {
    for (child of d.children) { // iterate over visible children
      if (search(child,id)) { // stop iteration if found
	    d.class = "found-path"; // label parent as part of path
        return true;
	  }
    }
	return false; // not found among children
  } else if (d._children) { 
    for (child of d._children) { // iterate over invisible children
      if (search(child,id)) { // stop iteration if found
	    d.class = "found-path"; // label parent as part of path
        return true;
	  }
    }
	return false; // not found among children
  } else {
    return false; // end of branch
  }
}

// Clear all search results
function clearAll(d) {
  d.class = "";
  if (d.children) {
	d.children.forEach(clearAll);
  } else if (d._children) {
	d._children.forEach(clearAll);
  }
}

/*--------------------------------------------------------------
# Helper functions - URL relocation
--------------------------------------------------------------*/

// Relocate to the url for a given id
function relocateToURL(id) {
  var base = location.protocol + '//' + location.host + location.pathname;	  
  var get = "?node=" + id;
  window.location.href = base + "" + get;
}

// Retrieve GET parameters
function parseGET(url) {
  // Regular expressions
  var queryStart = url.indexOf("?") + 1,
	queryEnd = url.indexOf("#") + 1 || url.length + 1,
	query = url.slice(queryStart, queryEnd - 1),
	pairs = query.replace(/\+/g, " ").split("&"),
	parms = {}, i, n, v, nv;
	
  // Return on no or empty match
  if (query === url || query === "") return;
	
  // Split and store parameters
  for (i = 0; i < pairs.length; i++) {
	nv = pairs[i].split("=", 2);
	n = decodeURIComponent(nv[0]);
	v = decodeURIComponent(nv[1]);

	if (!parms.hasOwnProperty(n)) parms[n] = [];
	parms[n].push(nv.length === 2 ? v : null);
  }
  return parms;
}